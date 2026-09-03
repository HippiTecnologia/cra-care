-- Etapa 5: Portal do Paciente real.
-- Salva termo, lembretes, calendário, uso dos frascos e avaliações no Supabase.

create table if not exists public.patient_portal_settings (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  reminders jsonb not null default '{"enabled":false,"weekdays":[1,3,5],"time":"09:00"}'::jsonb,
  day_overrides jsonb not null default '{}'::jsonb,
  read_notification_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_use_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  bottle_id uuid references public.bottles(id) on delete set null,
  use_date date not null,
  registered_at timestamptz not null default now(),
  drops integer not null default 0 check (drops >= 0),
  unique (patient_id, use_date)
);

create index if not exists patient_portal_settings_clinic_idx on public.patient_portal_settings(clinic_id);
create index if not exists patient_use_records_patient_date_idx on public.patient_use_records(patient_id, use_date desc);

alter table public.patient_portal_settings enable row level security;
alter table public.patient_use_records enable row level security;

grant select, insert, update, delete on public.patient_portal_settings to authenticated;
grant select, insert, update, delete on public.patient_use_records to authenticated;

-- Pacientes não possuem linha em public.profiles. Por isso o acesso próprio
-- não pode depender de current_clinic_id(), que só resolve perfis da equipe.
drop policy if exists "perfis autorizados leem pacientes" on public.patients;
create policy "perfis autorizados leem pacientes" on public.patients
for select to authenticated
using (
  auth_user_id = auth.uid()
  or (
    clinic_id = public.current_clinic_id()
    and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'laboratorio')
  )
  or (
    clinic_id = public.current_clinic_id()
    and public.current_app_role() = 'medico'
    and doctor_profile_id = auth.uid()
  )
);

drop policy if exists "paciente le receitas proprias" on public.prescriptions;
create policy "paciente le receitas proprias" on public.prescriptions
for select to authenticated
using (exists (
  select 1 from public.patients patient
  where patient.id = prescriptions.patient_id and patient.auth_user_id = auth.uid()
));

drop policy if exists "equipe gerencia configuracoes do portal" on public.patient_portal_settings;
drop policy if exists "paciente gerencia configuracoes do portal" on public.patient_portal_settings;
create policy "equipe gerencia configuracoes do portal" on public.patient_portal_settings
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria'));
create policy "paciente gerencia configuracoes do portal" on public.patient_portal_settings
for all to authenticated
using (exists (select 1 from public.patients patient where patient.id = patient_portal_settings.patient_id and patient.auth_user_id = auth.uid()))
with check (exists (select 1 from public.patients patient where patient.id = patient_portal_settings.patient_id and patient.auth_user_id = auth.uid()));

drop policy if exists "equipe gerencia registros de uso" on public.patient_use_records;
drop policy if exists "paciente gerencia registros de uso" on public.patient_use_records;
create policy "equipe gerencia registros de uso" on public.patient_use_records
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico', 'laboratorio'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico', 'laboratorio'));
create policy "paciente gerencia registros de uso" on public.patient_use_records
for all to authenticated
using (exists (select 1 from public.patients patient where patient.id = patient_use_records.patient_id and patient.auth_user_id = auth.uid()))
with check (exists (select 1 from public.patients patient where patient.id = patient_use_records.patient_id and patient.auth_user_id = auth.uid()));

drop policy if exists "clinic access bottles" on public.bottles;
drop policy if exists "equipe acessa frascos" on public.bottles;
drop policy if exists "paciente acessa frascos" on public.bottles;
create policy "equipe acessa frascos" on public.bottles
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico', 'laboratorio'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico', 'laboratorio'));
create policy "paciente acessa frascos" on public.bottles
for all to authenticated
using (exists (select 1 from public.patients patient where patient.id = bottles.patient_id and patient.auth_user_id = auth.uid()))
with check (exists (select 1 from public.patients patient where patient.id = bottles.patient_id and patient.auth_user_id = auth.uid()));

drop policy if exists "clinic access assessments" on public.patient_assessments;
drop policy if exists "secretaria atualiza avaliacoes" on public.patient_assessments;
drop policy if exists "equipe acessa avaliacoes" on public.patient_assessments;
drop policy if exists "paciente acessa avaliacoes" on public.patient_assessments;
create policy "equipe acessa avaliacoes" on public.patient_assessments
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'medico'));
create policy "paciente acessa avaliacoes" on public.patient_assessments
for all to authenticated
using (exists (select 1 from public.patients patient where patient.id = patient_assessments.patient_id and patient.auth_user_id = auth.uid()))
with check (exists (select 1 from public.patients patient where patient.id = patient_assessments.patient_id and patient.auth_user_id = auth.uid()));

drop policy if exists "paciente assina proprio contrato" on public.patient_contracts;
create policy "paciente assina proprio contrato" on public.patient_contracts
for update to authenticated
using (exists (select 1 from public.patients patient where patient.id = patient_contracts.patient_id and patient.auth_user_id = auth.uid()))
with check (exists (select 1 from public.patients patient where patient.id = patient_contracts.patient_id and patient.auth_user_id = auth.uid()));
drop policy if exists "paciente cria proprio contrato" on public.patient_contracts;
create policy "paciente cria proprio contrato" on public.patient_contracts
for insert to authenticated
with check (exists (select 1 from public.patients patient where patient.id = patient_contracts.patient_id and patient.auth_user_id = auth.uid()));

drop policy if exists "paciente le medico vinculado" on public.profiles;
create policy "paciente le medico vinculado" on public.profiles
for select to authenticated
using (exists (
  select 1 from public.patients patient
  where patient.doctor_profile_id = profiles.id and patient.auth_user_id = auth.uid()
));
