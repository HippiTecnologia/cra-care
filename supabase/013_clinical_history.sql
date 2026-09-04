-- Histórico clínico múltiplo: uma entrada independente por evolução registrada.

create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_profile_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_records_patient_idx
  on public.clinical_records(patient_id, created_at desc);

alter table public.clinical_records enable row level security;

grant select, insert, update, delete on public.clinical_records to authenticated;

create policy "medico acessa seu historico clinico"
on public.clinical_records
for all
to authenticated
using (
  clinic_id = public.current_clinic_id()
  and doctor_profile_id = auth.uid()
  and public.current_app_role() = 'medico'
  and exists (
    select 1 from public.patients patient
    where patient.id = clinical_records.patient_id
      and patient.doctor_profile_id = auth.uid()
  )
)
with check (
  clinic_id = public.current_clinic_id()
  and doctor_profile_id = auth.uid()
  and public.current_app_role() = 'medico'
  and exists (
    select 1 from public.patients patient
    where patient.id = clinical_records.patient_id
      and patient.doctor_profile_id = auth.uid()
  )
);