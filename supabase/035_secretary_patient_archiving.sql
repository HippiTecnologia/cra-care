-- Arquivamento reversível de pacientes pela Secretaria.
-- Não exclui prontuários, receitas, pagamentos ou histórico.

alter table public.patients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

create index if not exists patients_active_clinic_idx
  on public.patients (clinic_id, created_at desc)
  where archived_at is null;
create index if not exists patients_archived_clinic_idx
  on public.patients (clinic_id, archived_at desc)
  where archived_at is not null;

comment on column public.patients.archived_at is 'Cadastro oculto reversivelmente pela Secretaria; não apaga o histórico clínico.';
comment on column public.patients.archived_by is 'Perfil da Secretaria que arquivou o cadastro.';
comment on column public.patients.archive_reason is 'Motivo do arquivamento informado pela Secretaria.';

-- Remove políticas antigas/permissivas de leitura para que nenhuma delas
-- revele um cadastro arquivado a outro perfil.
drop policy if exists "staff read patients" on public.patients;
drop policy if exists "staff manage patients" on public.patients;
drop policy if exists "staff or patient reads patient" on public.patients;
drop policy if exists "equipe ou paciente le cadastro" on public.patients;
drop policy if exists "equipe autorizada gerencia pacientes" on public.patients;
drop policy if exists "perfis autorizados leem pacientes" on public.patients;
drop policy if exists "enfermagem consulta pacientes da clinica" on public.patients;
drop policy if exists "medico consulta pacientes da clinica" on public.patients;
drop policy if exists "enfermagem gerencia seus pacientes" on public.patients;
drop policy if exists "enfermagem cria seus pacientes" on public.patients;
drop policy if exists "pacientes ativos e arquivo da secretaria" on public.patients;
drop policy if exists "pacientes ativos visiveis aos perfis" on public.patients;

create policy "pacientes ativos visiveis aos perfis"
on public.patients
for select to authenticated
using (
  (
    clinic_id = public.current_clinic_id()
    and archived_at is null
    and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico', 'laboratorio', 'enfermagem')
  )
  or (auth_user_id = auth.uid() and archived_at is null)
);

drop policy if exists "medico ou secretaria cria paciente" on public.patients;
drop policy if exists "equipe cria pacientes ativos" on public.patients;
create policy "equipe cria pacientes ativos"
on public.patients
for insert to authenticated
with check (
  clinic_id = public.current_clinic_id()
  and archived_at is null
  and (
    public.current_app_role() in ('super_admin', 'admin', 'secretaria')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
    or (public.current_app_role() = 'enfermagem' and nursing_profile_id = auth.uid())
  )
);

-- A Secretaria pode arquivar/restaurar qualquer paciente da própria clínica.
-- Médicos e demais perfis não podem alterar cadastros arquivados.
drop policy if exists "medico ou secretaria atualiza paciente" on public.patients;
drop policy if exists "equipe atualiza apenas pacientes visiveis" on public.patients;
create policy "equipe atualiza apenas pacientes visiveis"
on public.patients
for update to authenticated
using (
  clinic_id = public.current_clinic_id()
  and archived_at is null
  and (
    public.current_app_role() in ('super_admin', 'admin', 'secretaria')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
  )
)
with check (
  clinic_id = public.current_clinic_id()
  and archived_at is null
  and (
    public.current_app_role() in ('super_admin', 'admin', 'secretaria')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
  )
);

-- Enfermagem mantém a exclusão de seus cadastros ativos já existente, mas
-- um registro arquivado só pode ser restaurado pela Secretaria.
drop policy if exists "enfermagem exclui seus pacientes" on public.patients;
drop policy if exists "enfermagem exclui pacientes ativos proprios" on public.patients;
create policy "enfermagem exclui pacientes ativos proprios"
on public.patients
for delete to authenticated
using (
  clinic_id = public.current_clinic_id()
  and archived_at is null
  and public.current_app_role() = 'enfermagem'
  and nursing_profile_id = auth.uid()
);

-- Helper seguro para que as tabelas relacionadas também ocultem dados de
-- pacientes arquivados, sem apagar nenhum registro histórico.
create or replace function public.can_access_patient_record(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients patient
    where patient.id = p_patient_id
      and (
        patient.auth_user_id = auth.uid()
        or patient.clinic_id = public.current_clinic_id()
      )
      and (
        patient.archived_at is null
      )
  );
$$;

revoke all on function public.can_access_patient_record(uuid) from public, anon;
grant execute on function public.can_access_patient_record(uuid) to authenticated;

-- Somente estas operações explícitas permitem à Secretaria ver/alterar o
-- arquivo; SELECT/UPDATE comuns na tabela patients continuam retornando ativos.
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
  order by patient.archived_at desc;
$$;

create or replace function public.secretary_archive_patient(p_patient_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() is distinct from 'secretaria' then
    raise exception 'Somente a Secretaria pode desativar pacientes.';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo da desativação.';
  end if;

  update public.patients
  set archived_at = now(), archived_by = auth.uid(), archive_reason = trim(p_reason), updated_at = now()
  where id = p_patient_id
    and clinic_id = public.current_clinic_id()
    and archived_at is null;
  if not found then
    raise exception 'Paciente não encontrado ou já desativado.';
  end if;
end;
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
    and archived_at is not null;
  if not found then
    raise exception 'Paciente desativado não encontrado.';
  end if;
end;
$$;

revoke all on function public.secretary_list_archived_patients() from public, anon;
revoke all on function public.secretary_archive_patient(uuid, text) from public, anon;
revoke all on function public.secretary_restore_patient(uuid) from public, anon;
grant execute on function public.secretary_list_archived_patients() to authenticated;
grant execute on function public.secretary_archive_patient(uuid, text) to authenticated;
grant execute on function public.secretary_restore_patient(uuid) to authenticated;

-- Em todas as tabelas protegidas que apontam para patients, permite acesso
-- somente enquanto o paciente estiver ativo. O histórico é preservado e volta
-- a ficar disponível às áreas autorizadas depois da reativação.
do $$
declare
  target_table record;
begin
  for target_table in
    select distinct cls.relname as table_name
    from pg_class cls
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    join pg_attribute attr on attr.attrelid = cls.oid
    where nsp.nspname = 'public'
      and cls.relkind = 'r'
      and cls.relrowsecurity
      and attr.attname = 'patient_id'
      and attr.atttypid = 'uuid'::regtype
      and not attr.attisdropped
      and cls.relname <> 'patients'
  loop
    execute format('drop policy if exists %I on public.%I', 'patient_archive_visibility', target_table.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (patient_id is null or public.can_access_patient_record(patient_id)) with check (patient_id is null or public.can_access_patient_record(patient_id))',
      'patient_archive_visibility', target_table.table_name
    );
  end loop;
end;
$$;

-- RPCs SECURITY DEFINER também respeitam o arquivo reversível.
create or replace function public.assume_patient_care(target_patient_id uuid)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_patient public.patients;
begin
  if public.current_app_role() <> 'medico' then
    raise exception 'Somente médicos podem assumir acompanhamento.';
  end if;

  update public.patients
  set doctor_profile_id = auth.uid(), updated_at = now()
  where id = target_patient_id
    and clinic_id = public.current_clinic_id()
    and archived_at is null
  returning * into updated_patient;

  if updated_patient.id is null then
    raise exception 'Paciente não encontrado nesta clínica.';
  end if;

  return updated_patient;
end;
$$;

create or replace function public.update_nursing_patient_profile_fields(
  p_patient_id uuid,
  p_full_name text,
  p_cpf text,
  p_birth_date date,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() <> 'enfermagem' then
    raise exception 'Somente a Enfermagem pode editar dados cadastrais por esta operação.';
  end if;

  update public.patients
  set full_name = trim(p_full_name),
      cpf = regexp_replace(p_cpf, '[^0-9]', '', 'g'),
      birth_date = p_birth_date,
      phone = nullif(trim(p_phone), ''),
      updated_at = now()
  where id = p_patient_id
    and clinic_id = public.current_clinic_id()
    and archived_at is null;

  if not found then
    raise exception 'Paciente não encontrado nesta clínica.';
  end if;
end;
$$;

revoke all on function public.assume_patient_care(uuid) from public, anon;
grant execute on function public.assume_patient_care(uuid) to authenticated;
revoke all on function public.update_nursing_patient_profile_fields(uuid, text, text, date, text) from public, anon;
grant execute on function public.update_nursing_patient_profile_fields(uuid, text, text, date, text) to authenticated;

notify pgrst, 'reload schema';

