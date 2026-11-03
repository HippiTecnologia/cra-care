-- Notificacoes futuras enviadas pela Secretaria.
-- A leitura e escrita ficam restritas ao service_role; o app acessa pela API autenticada.

create table if not exists public.scheduled_patient_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  patient_ids uuid[] not null check (cardinality(patient_ids) > 0),
  icon text not null default '📣',
  title text not null check (length(trim(title)) between 1 and 120),
  message text not null check (length(trim(message)) between 1 and 3000),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  sent_patient_count integer not null default 0 check (sent_patient_count >= 0),
  push_sent_count integer not null default 0 check (push_sent_count >= 0),
  last_error text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_patient_notifications_due_idx
  on public.scheduled_patient_notifications (scheduled_for)
  where status = 'pending';

create index if not exists scheduled_patient_notifications_clinic_created_idx
  on public.scheduled_patient_notifications (clinic_id, created_at desc);

alter table public.scheduled_patient_notifications enable row level security;
revoke all on public.scheduled_patient_notifications from anon, authenticated;
grant select, insert, update, delete on public.scheduled_patient_notifications to service_role;

-- Reserva lotes pequenos de forma atomica: duas execucoes do cron nao pegam a mesma notificacao.
create or replace function public.claim_due_scheduled_patient_notifications(p_limit integer default 10)
returns setof public.scheduled_patient_notifications
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.scheduled_patient_notifications
  set status = 'failed',
      last_error = coalesce(last_error, 'O envio foi interrompido após várias tentativas.'),
      updated_at = now()
  where status = 'sending'
    and attempts >= 5
    and updated_at < now() - interval '10 minutes';

  return query
  with due as (
    select id
    from public.scheduled_patient_notifications
    where attempts < 5
      and (
        (status = 'pending' and scheduled_for <= now())
        or (status = 'sending' and updated_at < now() - interval '10 minutes')
      )
    order by scheduled_for, created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 25)
  ), claimed as (
    update public.scheduled_patient_notifications notification
    set status = 'sending', attempts = notification.attempts + 1, updated_at = now()
    from due
    where notification.id = due.id
    returning notification.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_due_scheduled_patient_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_patient_notifications(integer) to service_role;

-- Registra o aviso no sino do portal em uma operacao do banco, sem substituir
-- configuracoes ou avisos existentes; o identificador torna a tentativa repetivel.
create or replace function public.deliver_scheduled_patient_notification(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job public.scheduled_patient_notifications%rowtype;
  v_patient_ids uuid[];
  v_now timestamptz := clock_timestamp();
begin
  select * into v_job
  from public.scheduled_patient_notifications
  where id = p_job_id and status = 'sending';

  if not found then
    raise exception 'O agendamento nao esta reservado para envio.';
  end if;

  with recipients as (
    select distinct patient.id as patient_id,
      jsonb_build_object(
        'id', v_job.id::text || ':' || patient.id::text,
        'icon', coalesce(nullif(v_job.icon, ''), '📣'),
        'title', v_job.title,
        'text', v_job.message,
        'createdAt', v_now,
        'createdBy', coalesce(nullif(v_job.created_by_name, ''), 'Secretaria')
      ) as notification
    from unnest(v_job.patient_ids) as target(patient_id)
    join public.patients patient
      on patient.id = target.patient_id
     and patient.clinic_id = v_job.clinic_id
     and patient.archived_at is null
  ), upserted as (
    insert into public.patient_portal_settings as current_settings (patient_id, clinic_id, manual_notifications, updated_at)
    select patient_id, v_job.clinic_id, jsonb_build_array(notification), v_now
    from recipients
    on conflict (patient_id) do update
    set manual_notifications =
      (case
        when jsonb_typeof(coalesce(current_settings.manual_notifications, '[]'::jsonb)) = 'array'
          then coalesce(current_settings.manual_notifications, '[]'::jsonb)
        else '[]'::jsonb
      end)
      || case when exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(current_settings.manual_notifications, '[]'::jsonb)) = 'array'
              then coalesce(current_settings.manual_notifications, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) as existing(item)
        where existing.item ->> 'id' = (excluded.manual_notifications -> 0 ->> 'id')
      ) then '[]'::jsonb else excluded.manual_notifications end,
      updated_at = excluded.updated_at
    returning patient_id
  )
  select coalesce(array_agg(patient_id), '{}'::uuid[])
  into v_patient_ids
  from upserted;

  if cardinality(v_patient_ids) = 0 then
    raise exception 'Nenhum destinatario ativo no momento do envio.';
  end if;

  return jsonb_build_object('patient_ids', v_patient_ids, 'patient_count', cardinality(v_patient_ids));
end;
$$;

revoke all on function public.deliver_scheduled_patient_notification(uuid) from public, anon, authenticated;
grant execute on function public.deliver_scheduled_patient_notification(uuid) to service_role;

notify pgrst, 'reload schema';
