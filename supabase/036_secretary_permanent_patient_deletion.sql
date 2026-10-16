-- Exclusão permanente e restrita à Secretaria, somente para cadastros sem
-- histórico ou outros registros vinculados. Cadastros com dados relacionados
-- devem ser desativados para preservar o histórico clínico e financeiro.

create or replace function public.secretary_delete_patient_if_empty(
  p_patient_id uuid,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_name text;
  patient_auth_user_id uuid;
  related_table record;
  has_related_rows boolean;
begin
  if public.current_app_role() is distinct from 'secretaria' then
    raise exception 'Somente a Secretaria pode excluir cadastros de pacientes.';
  end if;

  select patient.full_name, patient.auth_user_id
    into patient_name, patient_auth_user_id
  from public.patients patient
  where patient.id = p_patient_id
    and patient.clinic_id = public.current_clinic_id()
  for update;

  if not found then
    raise exception 'Paciente não encontrado nesta clínica.';
  end if;

  if coalesce(p_confirmation, '') <> ('EXCLUIR ' || patient_name) then
    raise exception 'Confirmação incorreta. Digite EXCLUIR seguido do nome completo do paciente.';
  end if;

  if patient_auth_user_id is not null then
    raise exception 'Este paciente possui acesso ao portal. Desative o cadastro para bloquear o acesso sem apagar dados.';
  end if;

  -- Detecta qualquer FK direta para patients.id, inclusive colunas que não se
  -- chamam patient_id (por exemplo referências a documentos ou assinaturas).
  for related_table in
    select source_schema.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name
    from pg_constraint constraint_row
    join pg_class source_table on source_table.oid = constraint_row.conrelid
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_attribute source_column
      on source_column.attrelid = source_table.oid
      and source_column.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.patients'::regclass
      and cardinality(constraint_row.conkey) = 1
      and source_schema.nspname = 'public'
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I = $1)',
      related_table.schema_name,
      related_table.table_name,
      related_table.column_name
    ) into has_related_rows using p_patient_id;
    if has_related_rows then
      raise exception 'Este paciente possui histórico ou registros vinculados. Use Desativar cadastro para preservar os dados.';
    end if;
  end loop;

  -- Também protege tabelas antigas sem foreign key formal, desde que usem
  -- patient_id uuid. Não apaga nem desassocia esses registros.
  for related_table in
    select source_schema.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name
    from pg_class source_table
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_attribute source_column on source_column.attrelid = source_table.oid
    where source_schema.nspname = 'public'
      and source_table.relkind in ('r', 'p')
      and source_table.relname <> 'patients'
      and source_column.attname = 'patient_id'
      and source_column.atttypid in (
        'uuid'::regtype,
        'text'::regtype,
        'varchar'::regtype,
        'bpchar'::regtype
      )
      and not source_column.attisdropped
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I::text = $1::text)',
      related_table.schema_name,
      related_table.table_name,
      related_table.column_name
    ) into has_related_rows using p_patient_id;
    if has_related_rows then
      raise exception 'Este paciente possui histórico ou registros vinculados. Use Desativar cadastro para preservar os dados.';
    end if;
  end loop;

  -- Mantém trilha de auditoria sem conservar nome, CPF ou outros dados pessoais.
  insert into public.audit_logs (clinic_id, actor_id, action, entity, entity_id, details)
  values (
    public.current_clinic_id(),
    auth.uid(),
    'permanent_delete',
    'patient',
    p_patient_id,
    '{}'::jsonb
  );

  delete from public.patients
  where id = p_patient_id
    and clinic_id = public.current_clinic_id();

  if not found then
    raise exception 'Paciente não encontrado ou não foi possível excluir o cadastro.';
  end if;
end;
$$;

revoke all on function public.secretary_delete_patient_if_empty(uuid, text) from public, anon;
grant execute on function public.secretary_delete_patient_if_empty(uuid, text) to authenticated;

notify pgrst, 'reload schema';
