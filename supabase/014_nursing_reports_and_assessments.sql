-- Enfermagem, laudos e avaliação bimestral da imunoterapia.
-- Execute antes o arquivo 014a_add_enfermagem_role.sql, em uma consulta separada.

alter table public.patients add column if not exists nursing_profile_id uuid references public.profiles(id) on delete set null;
alter table public.patient_assessments add column if not exists assessment_type text check (assessment_type in ('inicial', 'acompanhamento'));
alter table public.patient_assessments add column if not exists nuisance_score smallint check (nuisance_score between 0 and 10);
alter table public.patient_assessments add column if not exists symptom_scores jsonb not null default '{}'::jsonb;
alter table public.patient_assessments add column if not exists symptom_total smallint;
alter table public.patient_assessments add column if not exists missed_immunotherapy text;
alter table public.patient_assessments add column if not exists rescue_medication text;

create table if not exists public.nursing_reports (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  nurse_profile_id uuid not null references public.profiles(id) on delete restrict,
  doctor_profile_id uuid references public.profiles(id) on delete set null,
  report_type text not null check (report_type in ('prick_test','patch_test')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nursing_reports_patient_idx on public.nursing_reports(patient_id, created_at desc);
alter table public.nursing_reports enable row level security;
grant select, insert, update, delete on public.nursing_reports to authenticated;

drop policy if exists "enfermagem gerencia seus pacientes" on public.patients;
create policy "enfermagem gerencia seus pacientes" on public.patients for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() = 'enfermagem' and nursing_profile_id = auth.uid())
with check (clinic_id = public.current_clinic_id() and public.current_app_role() = 'enfermagem' and nursing_profile_id = auth.uid());

drop policy if exists "enfermagem e medico acessam laudos" on public.nursing_reports;
create policy "enfermagem e medico acessam laudos" on public.nursing_reports for all to authenticated
using (clinic_id = public.current_clinic_id() and (nurse_profile_id = auth.uid() or doctor_profile_id = auth.uid() or public.current_app_role() in ('admin','super_admin')))
with check (clinic_id = public.current_clinic_id() and (nurse_profile_id = auth.uid() or public.current_app_role() in ('admin','super_admin')));
