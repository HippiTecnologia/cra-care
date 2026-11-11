-- Dados específicos de entrega por frasco e unificação transacional de pacientes.

alter table public.patients
  add column if not exists merged_into_patient_id uuid references public.patients(id) on delete restrict,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references public.profiles(id) on delete set null;

create index if not exists patients_merged_into_idx
  on public.patients(merged_into_patient_id)
  where merged_into_patient_id is not null;

create or replace function public.secretary_merge_array_by_treatment(p_source jsonb, p_primary jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with entries as (
    select item.value, 0 as preference, item.ordinality
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(p_source) = 'array' then p_source else '[]'::jsonb end
    ) with ordinality as item(value, ordinality)
    union all
    select item.value, 1 as preference, item.ordinality
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(p_primary) = 'array' then p_primary else '[]'::jsonb end
    ) with ordinality as item(value, ordinality)
  ), ranked as (
    select entries.*,
      row_number() over (
        partition by coalesce(entries.value ->> 'treatment', entries.value ->> 'id', entries.value::text)
        order by entries.preference desc, entries.ordinality desc
      ) as row_number
    from entries
  )
  select coalesce(
    pg_catalog.jsonb_agg(ranked.value order by ranked.preference, ranked.ordinality),
    '[]'::jsonb
  )
  from ranked
  where ranked.row_number = 1;
$$;

revoke all on function public.secretary_merge_array_by_treatment(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.secretary_merge_object(p_source jsonb, p_primary jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when pg_catalog.jsonb_typeof(p_source) = 'object' then p_source else '{}'::jsonb end
    || coalesce((
      select pg_catalog.jsonb_object_agg(item.key, item.value)
      from pg_catalog.jsonb_each(
        case when pg_catalog.jsonb_typeof(p_primary) = 'object' then p_primary else '{}'::jsonb end
      ) as item(key, value)
      where item.value <> 'null'::jsonb and item.value <> '""'::jsonb
    ), '{}'::jsonb);
$$;

revoke all on function public.secretary_merge_object(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.secretary_update_stock_delivery(
  p_bottle_id uuid,
  p_method text,
  p_address jsonb,
  p_notes text,
  p_save_as_default boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_patient_id uuid;
  v_status text;
begin
  if public.current_app_role() is distinct from 'secretaria' then
    raise exception 'Somente a Secretaria pode ajustar os dados de entrega.';
  end if;
  if p_method is null or p_method not in ('Motoboy', 'Retirada', 'Sedex', 'Aéreo') then
    raise exception 'Selecione um método de recebimento válido.';
  end if;
  if pg_catalog.jsonb_typeof(p_address) is distinct from 'object'
     or exists (
       select 1 from pg_catalog.jsonb_each_text(p_address) as field(key, value)
       where field.key not in ('zipCode', 'street', 'number', 'complement', 'neighborhood', 'city', 'state')
          or pg_catalog.char_length(field.value) > 250
     ) then
    raise exception 'Confira os campos do endereço de entrega.';
  end if;
  if pg_catalog.char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'As observações da entrega devem ter até 2.000 caracteres.';
  end if;

  select bottle.patient_id, bottle.status
    into v_patient_id, v_status
  from public.bottles as bottle
  where bottle.id = p_bottle_id
    and bottle.clinic_id = v_clinic_id
  for update;

  if not found or v_patient_id is null then
    raise exception 'Frasco vinculado a paciente não encontrado nesta clínica.';
  end if;
  if v_status = 'entregue' then
    raise exception 'A entrega já foi concluída e os dados históricos não podem ser alterados.';
  end if;

  update public.bottles as bottle
  set metadata = coalesce(bottle.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'delivery', p_method,
        'deliveryAddress', p_address,
        'deliveryNotes', coalesce(p_notes, '')
      )
  where bottle.id = p_bottle_id
    and bottle.clinic_id = v_clinic_id;

  if coalesce(p_save_as_default, false) then
    update public.patients as patient
    set treatment = coalesce(patient.treatment, '{}'::jsonb) || pg_catalog.jsonb_build_object('delivery', p_method),
        updated_at = pg_catalog.now()
    where patient.id = v_patient_id
      and patient.clinic_id = v_clinic_id
      and patient.archived_at is null;
    if not found then
      raise exception 'O cadastro ativo do paciente não foi encontrado.';
    end if;
  end if;

  insert into public.audit_logs (clinic_id, actor_id, action, entity, entity_id, details)
  values (
    v_clinic_id, auth.uid(), 'update_delivery_details', 'bottle', p_bottle_id,
    pg_catalog.jsonb_build_object('patient_id', v_patient_id, 'method', p_method, 'saved_as_default', coalesce(p_save_as_default, false))
  );

  return pg_catalog.jsonb_build_object('patientId', v_patient_id, 'method', p_method, 'savedAsDefault', coalesce(p_save_as_default, false));
end;
$$;

revoke all on function public.secretary_update_stock_delivery(uuid, text, jsonb, text, boolean) from public, anon;
grant execute on function public.secretary_update_stock_delivery(uuid, text, jsonb, text, boolean) to authenticated;

create or replace function public.secretary_merge_duplicate_patients(
  p_primary_patient_id uuid,
  p_duplicate_patient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_primary public.patients%rowtype;
  v_duplicate public.patients%rowtype;
  v_relation record;
  v_history record;
  v_source_commission record;
  v_primary_sale_id uuid;
  v_duplicate_sale_id uuid;
  v_target_id uuid;
  v_match_count integer;
  v_max_bottle integer;
  v_rows integer;
  v_moved_records integer := 0;
  v_address jsonb;
  v_treatment jsonb;
  v_financial jsonb;
  v_array jsonb;
begin
  if public.current_app_role() is distinct from 'secretaria' then
    raise exception 'Somente a Secretaria pode unificar cadastros de pacientes.';
  end if;
  if p_primary_patient_id is null or p_duplicate_patient_id is null
     or p_primary_patient_id = p_duplicate_patient_id then
    raise exception 'Escolha dois cadastros diferentes para unificar.';
  end if;

  -- Bloqueia ambos os cadastros em ordem estável para evitar unificações concorrentes.
  perform patient.id
  from public.patients as patient
  where patient.id in (p_primary_patient_id, p_duplicate_patient_id)
    and patient.clinic_id = v_clinic_id
  order by patient.id
  for update;

  select * into v_primary
  from public.patients as patient
  where patient.id = p_primary_patient_id and patient.clinic_id = v_clinic_id;
  if not found then raise exception 'O cadastro principal não foi encontrado nesta clínica.'; end if;

  select * into v_duplicate
  from public.patients as patient
  where patient.id = p_duplicate_patient_id and patient.clinic_id = v_clinic_id;
  if not found then raise exception 'O cadastro a incorporar não foi encontrado nesta clínica.'; end if;

  if v_primary.archived_at is not null or v_primary.merged_into_patient_id is not null
     or v_duplicate.archived_at is not null or v_duplicate.merged_into_patient_id is not null then
    raise exception 'Só é possível unificar dois cadastros ativos que ainda não foram unificados.';
  end if;

  if pg_catalog.length(pg_catalog.regexp_replace(coalesce(v_primary.cpf, ''), '[^0-9]', '', 'g')) <> 11
     or pg_catalog.regexp_replace(coalesce(v_primary.cpf, ''), '[^0-9]', '', 'g')
        <> pg_catalog.regexp_replace(coalesce(v_duplicate.cpf, ''), '[^0-9]', '', 'g') then
    raise exception 'Os dois cadastros precisam ter o mesmo CPF válido.';
  end if;

  if v_primary.auth_user_id is not null and v_duplicate.auth_user_id is not null
     and v_primary.auth_user_id <> v_duplicate.auth_user_id then
    raise exception 'Os dois cadastros têm acessos de paciente diferentes. A equipe precisa revisar os acessos antes da unificação.';
  end if;
  if nullif(pg_catalog.btrim(v_primary.username), '') is not null
     and nullif(pg_catalog.btrim(v_duplicate.username), '') is not null
     and pg_catalog.lower(v_primary.username) <> pg_catalog.lower(v_duplicate.username) then
    raise exception 'Os cadastros têm nomes de usuário diferentes. Revise qual acesso deve continuar antes da unificação.';
  end if;
  if exists (
    select 1 from public.patient_contracts as source_contract
    where source_contract.patient_id = p_duplicate_patient_id
  ) and exists (
    select 1 from public.patient_contracts as primary_contract
    where primary_contract.patient_id = p_primary_patient_id
  ) then
    raise exception 'Os dois cadastros têm contratos. Revise os documentos antes da unificação para preservar as assinaturas.';
  end if;
  if exists (
    select 1
    from public.digital_signatures as source_signature
    join public.digital_signatures as primary_signature
      on primary_signature.clinic_id = source_signature.clinic_id
     and primary_signature.document_type = source_signature.document_type
     and primary_signature.document_id = source_signature.document_id
     and primary_signature.signer_user_id = source_signature.signer_user_id
    where source_signature.patient_id = p_duplicate_patient_id
      and primary_signature.patient_id = p_primary_patient_id
  ) then
    raise exception 'Há assinaturas digitais repetidas para o mesmo documento. Revise-as antes da unificação.';
  end if;

  -- Mantém os dados do cadastro escolhido e completa seus campos vazios.
  v_address := public.secretary_merge_object(v_duplicate.address, v_primary.address);
  v_treatment := public.secretary_merge_object(v_duplicate.treatment, v_primary.treatment);
  if pg_catalog.jsonb_typeof(v_duplicate.treatment -> 'treatmentBottles') = 'array'
     or pg_catalog.jsonb_typeof(v_primary.treatment -> 'treatmentBottles') = 'array' then
    v_array := public.secretary_merge_array_by_treatment(v_duplicate.treatment -> 'treatmentBottles', v_primary.treatment -> 'treatmentBottles');
    v_treatment := pg_catalog.jsonb_set(v_treatment, '{treatmentBottles}', v_array, true);
  end if;
  v_financial := public.secretary_merge_object(v_duplicate.financial, v_primary.financial);
  if pg_catalog.jsonb_typeof(v_duplicate.financial -> 'treatmentPayments') = 'array'
     or pg_catalog.jsonb_typeof(v_primary.financial -> 'treatmentPayments') = 'array' then
    v_array := public.secretary_merge_array_by_treatment(v_duplicate.financial -> 'treatmentPayments', v_primary.financial -> 'treatmentPayments');
    v_financial := pg_catalog.jsonb_set(v_financial, '{treatmentPayments}', v_array, true);
  end if;

  update public.patients as patient
  set full_name = case when nullif(pg_catalog.btrim(v_primary.full_name), '') is null then v_duplicate.full_name else v_primary.full_name end,
      birth_date = coalesce(v_primary.birth_date, v_duplicate.birth_date),
      phone = coalesce(nullif(pg_catalog.btrim(v_primary.phone), ''), v_duplicate.phone),
      email = coalesce(nullif(pg_catalog.btrim(v_primary.email), ''), v_duplicate.email),
      address = v_address,
      treatment = v_treatment,
      financial = v_financial,
      doctor_profile_id = coalesce(v_primary.doctor_profile_id, v_duplicate.doctor_profile_id),
      nursing_profile_id = coalesce(v_primary.nursing_profile_id, v_duplicate.nursing_profile_id),
      updated_at = pg_catalog.now()
  where patient.id = p_primary_patient_id and patient.clinic_id = v_clinic_id;

  -- Se apenas a ficha duplicada tem acesso, esse vínculo continua no cadastro principal.
  if v_primary.auth_user_id is null and v_duplicate.auth_user_id is not null then
    update public.patients
    set auth_user_id = null, username = null
    where id = p_duplicate_patient_id and clinic_id = v_clinic_id;
    update public.patients
    set auth_user_id = v_duplicate.auth_user_id,
        username = coalesce(nullif(pg_catalog.btrim(v_primary.username), ''), v_duplicate.username),
        access_status = v_duplicate.access_status,
        must_change_password = v_duplicate.must_change_password,
        deactivated_at = v_duplicate.deactivated_at,
        deactivation_reason = v_duplicate.deactivation_reason,
        deactivated_by = v_duplicate.deactivated_by,
        last_login_at = coalesce(v_primary.last_login_at, v_duplicate.last_login_at)
    where id = p_primary_patient_id and clinic_id = v_clinic_id;
  elsif nullif(pg_catalog.btrim(v_primary.username), '') is null
        and nullif(pg_catalog.btrim(v_duplicate.username), '') is not null
        and v_primary.auth_user_id is null then
    update public.patients set username = null where id = p_duplicate_patient_id and clinic_id = v_clinic_id;
    update public.patients
    set username = v_duplicate.username,
        access_status = v_duplicate.access_status,
        must_change_password = v_duplicate.must_change_password,
        deactivated_at = v_duplicate.deactivated_at,
        deactivation_reason = v_duplicate.deactivation_reason,
        deactivated_by = v_duplicate.deactivated_by,
        last_login_at = coalesce(v_primary.last_login_at, v_duplicate.last_login_at)
    where id = p_primary_patient_id and clinic_id = v_clinic_id;
  else
    update public.patients set auth_user_id = null, username = null where id = p_duplicate_patient_id and clinic_id = v_clinic_id;
  end if;

  -- A venda tem uma linha por paciente. Se ambas existem, guarda os dois snapshots na linha mantida.
  select sale.id into v_primary_sale_id from public.admin_sales as sale
  where sale.clinic_id = v_clinic_id and sale.patient_id = p_primary_patient_id for update;
  select sale.id into v_duplicate_sale_id from public.admin_sales as sale
  where sale.clinic_id = v_clinic_id and sale.patient_id = p_duplicate_patient_id for update;

  for v_source_commission in
    select commission.* from public.admin_commission_payments as commission
    where commission.patient_id = p_duplicate_patient_id
    order by commission.installment_key, commission.id
    for update
  loop
    select commission.id into v_target_id
    from public.admin_commission_payments as commission
    where commission.clinic_id = v_clinic_id
      and commission.installment_key = v_source_commission.installment_key
      and commission.id <> v_source_commission.id
    limit 1 for update;

    if v_target_id is not null then
      update public.admin_commission_payments as target
      set snapshot = coalesce(target.snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
            '_mergedSnapshots', coalesce(target.snapshot -> '_mergedSnapshots', '[]'::jsonb) || pg_catalog.jsonb_build_array(v_source_commission.snapshot)
          ),
          paid_at = coalesce(target.paid_at, v_source_commission.paid_at),
          paid_by = coalesce(target.paid_by, v_source_commission.paid_by)
      where target.id = v_target_id;
      delete from public.admin_commission_payments where id = v_source_commission.id;
      v_moved_records := v_moved_records + 1;
    else
      update public.admin_commission_payments as commission
      set patient_id = p_primary_patient_id,
          sale_id = case when v_primary_sale_id is not null and commission.sale_id = v_duplicate_sale_id then v_primary_sale_id else commission.sale_id end
      where commission.id = v_source_commission.id;
      v_moved_records := v_moved_records + 1;
    end if;
    v_target_id := null;
  end loop;

  if v_duplicate_sale_id is not null and v_primary_sale_id is not null then
    update public.admin_sales as target
    set snapshot = coalesce(target.snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          '_mergedSnapshots', coalesce(target.snapshot -> '_mergedSnapshots', '[]'::jsonb) || pg_catalog.jsonb_build_array(source.snapshot)
        ),
        updated_at = pg_catalog.now()
    from public.admin_sales as source
    where target.id = v_primary_sale_id and source.id = v_duplicate_sale_id;
    delete from public.admin_sales where id = v_duplicate_sale_id;
    v_moved_records := v_moved_records + 1;
  elsif v_duplicate_sale_id is not null then
    update public.admin_sales
    set patient_id = p_primary_patient_id, updated_at = pg_catalog.now()
    where id = v_duplicate_sale_id;
    v_primary_sale_id := v_duplicate_sale_id;
    v_moved_records := v_moved_records + 1;
  end if;

  -- Junta preferências, lembretes e notificações do portal, mantendo os valores principais quando coincidem.
  update public.patient_portal_settings as target
  set reminders = coalesce(source.reminders, '{}'::jsonb) || coalesce(target.reminders, '{}'::jsonb),
      day_overrides = coalesce(source.day_overrides, '{}'::jsonb) || coalesce(target.day_overrides, '{}'::jsonb),
      read_notification_ids = coalesce((
        select pg_catalog.array_agg(distinct notification_id)
        from pg_catalog.unnest(coalesce(source.read_notification_ids, '{}'::text[]) || coalesce(target.read_notification_ids, '{}'::text[])) as notification_id
      ), '{}'::text[]),
      manual_notifications = coalesce((
        select pg_catalog.jsonb_agg(items.value)
        from (
          select distinct notification.value
          from pg_catalog.jsonb_array_elements(coalesce(source.manual_notifications, '[]'::jsonb)) as notification(value)
          union
          select distinct notification.value
          from pg_catalog.jsonb_array_elements(coalesce(target.manual_notifications, '[]'::jsonb)) as notification(value)
        ) as items
      ), '[]'::jsonb),
      updated_at = greatest(target.updated_at, source.updated_at, pg_catalog.now())
  from public.patient_portal_settings as source
  where target.patient_id = p_primary_patient_id and source.patient_id = p_duplicate_patient_id;
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;
  delete from public.patient_portal_settings as source
  where source.patient_id = p_duplicate_patient_id
    and exists (select 1 from public.patient_portal_settings as target where target.patient_id = p_primary_patient_id);
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;

  -- Une pedidos de histórico duplicados pela mesma impressão digital ou linha importada.
  for v_history in
    select history.* from public.patient_order_history as history
    where history.patient_id = p_duplicate_patient_id
    order by history.imported_at, history.id
    for update
  loop
    select count(*) into v_match_count
    from public.patient_order_history as target
    where target.patient_id = p_primary_patient_id
      and (target.source_fingerprint = v_history.source_fingerprint
        or (target.source_file = v_history.source_file and target.source_row_number = v_history.source_row_number));

    if v_match_count > 1 then
      raise exception 'Há linhas de histórico que apontam para mais de um registro. Revise o histórico antes da unificação.';
    elsif v_match_count = 1 then
      select target.id into v_target_id
      from public.patient_order_history as target
      where target.patient_id = p_primary_patient_id
        and (target.source_fingerprint = v_history.source_fingerprint
          or (target.source_file = v_history.source_file and target.source_row_number = v_history.source_row_number))
      order by target.id
      limit 1;
      update public.patient_order_history as target
      set source_record = coalesce(target.source_record, '{}'::jsonb) || pg_catalog.jsonb_build_object(
            '_mergedSourceRecords', coalesce(target.source_record -> '_mergedSourceRecords', '[]'::jsonb) || pg_catalog.jsonb_build_array(v_history.source_record)
          )
      where target.id = v_target_id;
      delete from public.patient_order_history where id = v_history.id;
      v_moved_records := v_moved_records + 1;
    else
      update public.patient_order_history set patient_id = p_primary_patient_id where id = v_history.id;
      v_moved_records := v_moved_records + 1;
    end if;
    v_target_id := null;
  end loop;

  -- Combina lembretes já agendados para o mesmo instante sem criar duplicatas.
  update public.patient_treatment_reminder_deliveries as target
  set status = case
        when target.status = 'sent' or source.status = 'sent' then 'sent'
        when target.status = 'sending' or source.status = 'sending' then 'sending'
        when target.status = 'pending' or source.status = 'pending' then 'pending'
        else 'failed'
      end,
      attempts = greatest(target.attempts, source.attempts),
      push_sent_count = greatest(target.push_sent_count, source.push_sent_count),
      next_attempt_at = least(target.next_attempt_at, source.next_attempt_at),
      last_error = case when source.status = 'failed' and target.status <> 'sent' then coalesce(target.last_error, source.last_error) else target.last_error end,
      sent_at = coalesce(target.sent_at, source.sent_at),
      updated_at = greatest(target.updated_at, source.updated_at, pg_catalog.now())
  from public.patient_treatment_reminder_deliveries as source
  where target.patient_id = p_primary_patient_id
    and source.patient_id = p_duplicate_patient_id
    and target.treatment = source.treatment
    and target.local_date = source.local_date
    and target.scheduled_for = source.scheduled_for;
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;
  delete from public.patient_treatment_reminder_deliveries as source
  where source.patient_id = p_duplicate_patient_id
    and exists (
      select 1 from public.patient_treatment_reminder_deliveries as target
      where target.patient_id = p_primary_patient_id
        and target.treatment = source.treatment
        and target.local_date = source.local_date
        and target.scheduled_for = source.scheduled_for
    );
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;

  -- Um endpoint de push é único por dispositivo; conserva a inscrição mais recente.
  update public.push_subscriptions as target
  set subscription = case when source.updated_at > target.updated_at then source.subscription else target.subscription end,
      updated_at = greatest(target.updated_at, source.updated_at)
  from public.push_subscriptions as source
  where target.endpoint = source.endpoint
    and target.patient_id = p_primary_patient_id
    and source.patient_id = p_duplicate_patient_id;
  delete from public.push_subscriptions as source
  where source.patient_id = p_duplicate_patient_id
    and exists (select 1 from public.push_subscriptions as target where target.endpoint = source.endpoint and target.patient_id = p_primary_patient_id);
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;

  -- Notificações iguais ficam em uma só linha, sem perder o estado de leitura ou metadata.
  update public.team_notifications as target
  set read_at = coalesce(target.read_at, source.read_at),
      read_by = coalesce(target.read_by, source.read_by),
      metadata = coalesce(target.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        '_mergedNotifications', coalesce(target.metadata -> '_mergedNotifications', '[]'::jsonb) || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('title', source.title, 'message', source.message, 'href', source.href, 'metadata', source.metadata)
        )
      )
  from public.team_notifications as source
  where target.clinic_id = v_clinic_id
    and source.clinic_id = v_clinic_id
    and target.patient_id = p_primary_patient_id
    and source.patient_id = p_duplicate_patient_id
    and target.event_key = source.event_key;
  delete from public.team_notifications as source
  where source.patient_id = p_duplicate_patient_id
    and exists (select 1 from public.team_notifications as target where target.clinic_id = source.clinic_id and target.patient_id = p_primary_patient_id and target.event_key = source.event_key);
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;

  -- Evita choque no número do frasco e conserva os dados de rastreio no metadata.
  select coalesce(max(bottle.bottle_number), 0) into v_max_bottle
  from public.bottles as bottle where bottle.patient_id = p_primary_patient_id;
  for v_history in
    select bottle.id, bottle.bottle_number, bottle.received_at, bottle.metadata
    from public.bottles as bottle
    where bottle.patient_id = p_duplicate_patient_id
    order by bottle.bottle_number, bottle.received_at nulls last, bottle.id
    for update
  loop
    v_max_bottle := v_max_bottle + 1;
    update public.bottles as bottle
    set patient_id = p_primary_patient_id,
        bottle_number = v_max_bottle,
        metadata = coalesce(v_history.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          'patientId', p_primary_patient_id,
          'patientName', v_primary.full_name,
          'patientCpf', v_primary.cpf,
          'bottleNumber', v_max_bottle
        )
    where bottle.id = v_history.id;
    v_moved_records := v_moved_records + 1;
  end loop;

  update public.batch_items as item
  set metadata = coalesce(item.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'patientId', p_primary_patient_id,
        'patientName', v_primary.full_name,
        'patientCpf', v_primary.cpf
      )
  where item.patient_id = p_duplicate_patient_id;
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;

  -- Registros de uso sem número de frasco podem se chocar pela data; soma as gotas e preserva a data original.
  update public.patient_use_records as target
  set drops = coalesce(target.drops, 0) + coalesce(source.drops, 0),
      registered_at = least(target.registered_at, source.registered_at)
  from public.patient_use_records as source
  where target.patient_id = p_primary_patient_id
    and source.patient_id = p_duplicate_patient_id
    and target.bottle_id is null and source.bottle_id is null
    and target.use_date = source.use_date;
  delete from public.patient_use_records as source
  where source.patient_id = p_duplicate_patient_id
    and source.bottle_id is null
    and exists (
      select 1 from public.patient_use_records as target
      where target.patient_id = p_primary_patient_id and target.bottle_id is null and target.use_date = source.use_date
    );
  get diagnostics v_rows = row_count;
  v_moved_records := v_moved_records + v_rows;

  -- Move every other direct patient_id reference. Any remaining unique-key conflict aborts the whole transaction.
  for v_relation in
    select distinct source_table.relname as table_name
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as source_table on source_table.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as source_schema on source_schema.oid = source_table.relnamespace
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = source_table.oid and source_column.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.patients'::regclass
      and pg_catalog.cardinality(constraint_row.conkey) = 1
      and source_schema.nspname = 'public'
      and source_column.attname = 'patient_id'
      and source_table.relname not in (
        'admin_commission_payments', 'admin_sales', 'batch_items', 'bottles',
        'patient_order_history', 'patient_portal_settings', 'patient_treatment_reminder_deliveries',
        'patient_use_records', 'push_subscriptions', 'team_notifications'
      )
    order by source_table.relname
  loop
    execute pg_catalog.format('update public.%I set patient_id = $1 where patient_id = $2', v_relation.table_name)
      using p_primary_patient_id, p_duplicate_patient_id;
    get diagnostics v_rows = row_count;
    v_moved_records := v_moved_records + v_rows;
  end loop;

  update public.patients
  set merged_into_patient_id = p_primary_patient_id,
      merged_at = coalesce(merged_at, pg_catalog.now()),
      merged_by = auth.uid()
  where merged_into_patient_id = p_duplicate_patient_id;

  -- Arquiva a segunda ficha, remove seu CPF da chave única e deixa uma referência auditável à principal.
  update public.patients
  set auth_user_id = null,
      username = null,
      access_status = 'desativado',
      deactivated_at = coalesce(deactivated_at, pg_catalog.now()),
      deactivation_reason = 'Cadastro unificado ao cadastro principal.',
      archived_at = pg_catalog.now(),
      archived_by = auth.uid(),
      archive_reason = 'Unificado ao cadastro principal.',
      merged_into_patient_id = p_primary_patient_id,
      merged_at = pg_catalog.now(),
      merged_by = auth.uid(),
      updated_at = pg_catalog.now()
  where id = p_duplicate_patient_id and clinic_id = v_clinic_id;

  insert into public.audit_logs (clinic_id, actor_id, action, entity, entity_id, details)
  values (
    v_clinic_id,
    auth.uid(),
    'merge',
    'patient',
    p_primary_patient_id,
    pg_catalog.jsonb_build_object(
      'primary_patient_id', p_primary_patient_id,
      'merged_patient_id', p_duplicate_patient_id,
      'cpf_last_four', right(pg_catalog.regexp_replace(coalesce(v_primary.cpf, ''), '[^0-9]', '', 'g'), 4),
      'linked_rows_processed', v_moved_records
    )
  );

  return pg_catalog.jsonb_build_object(
    'patientId', p_primary_patient_id,
    'mergedPatientId', p_duplicate_patient_id,
    'linkedRowsProcessed', v_moved_records
  );
exception
  when unique_violation then
    raise exception 'Unificação cancelada: há registros vinculados com dados únicos que precisam ser revisados.'
      using errcode = '23505', detail = sqlerrm;
end;
$$;

revoke all on function public.secretary_merge_duplicate_patients(uuid, uuid) from public, anon;
grant execute on function public.secretary_merge_duplicate_patients(uuid, uuid) to authenticated;

create or replace function public.secretary_list_archived_patients()
returns table (
  id uuid,
  full_name text,
  cpf text,
  created_at timestamptz,
  archived_at timestamptz,
  archive_reason text,
  doctor_profile_id uuid,
  nursing_profile_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select patient.id, patient.full_name, patient.cpf, patient.created_at, patient.archived_at, patient.archive_reason,
    patient.doctor_profile_id, patient.nursing_profile_id
  from public.patients patient
  where public.current_app_role() = 'secretaria'
    and patient.clinic_id = public.current_clinic_id()
    and patient.archived_at is not null
    and patient.merged_into_patient_id is null
  order by patient.archived_at desc;
$$;

create or replace function public.secretary_restore_patient(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() is distinct from 'secretaria' then
    raise exception 'Somente a Secretaria pode reativar pacientes.';
  end if;

  update public.patients
  set archived_at = null, archived_by = null, archive_reason = null, updated_at = now()
  where id = p_patient_id
    and clinic_id = public.current_clinic_id()
    and archived_at is not null
    and merged_into_patient_id is null;
  if not found then
    raise exception 'Cadastro desativado não encontrado ou unificado. Cadastros unificados não podem ser reativados isoladamente.';
  end if;
end;
$$;

revoke all on function public.secretary_list_archived_patients() from public, anon;
revoke all on function public.secretary_restore_patient(uuid) from public, anon;
grant execute on function public.secretary_list_archived_patients() to authenticated;
grant execute on function public.secretary_restore_patient(uuid) to authenticated;
