-- Etapa 3: operação completa da Secretaria.
-- O script é idempotente e preserva todos os registros existentes.

alter table public.patient_assessments add column if not exists bottle_reference text;
alter table public.patient_assessments add column if not exists bottle_number integer not null default 0;
alter table public.patient_assessments add column if not exists feeling text;
alter table public.patient_assessments add column if not exists viewed_at timestamptz;
alter table public.patient_assessments add column if not exists viewed_by text;
alter table public.patient_assessments add column if not exists response text;
alter table public.patient_assessments add column if not exists responded_at timestamptz;
alter table public.patient_assessments add column if not exists responded_by text;

alter table public.batches add column if not exists code text;
alter table public.batches add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.batch_items add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists notes text;

alter table public.bottles add column if not exists batch_id uuid references public.batches(id) on delete set null;
alter table public.bottles add column if not exists reserved_at timestamptz;
alter table public.bottles add column if not exists delivered_at timestamptz;
alter table public.bottles add column if not exists checked_by text;
alter table public.bottles add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.bottles alter column patient_id drop not null;

create table if not exists public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  patient_name text not null,
  patient_cpf text not null,
  file_name text not null,
  file_data text not null,
  file_size integer not null default 0,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

alter table public.invoice_documents add column if not exists patient_name text;
alter table public.invoice_documents add column if not exists patient_cpf text;
alter table public.invoice_documents add column if not exists file_data text;
alter table public.invoice_documents add column if not exists file_size integer not null default 0;
alter table public.invoice_documents add column if not exists uploaded_by text;

create table if not exists public.patient_contracts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  signed_at timestamptz,
  signed_name text,
  signed_cpf text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id)
);

create index if not exists invoice_documents_patient_idx on public.invoice_documents(patient_id, created_at desc);
create index if not exists patient_contracts_patient_idx on public.patient_contracts(patient_id);
create index if not exists batches_clinic_created_idx on public.batches(clinic_id, created_at desc);
create index if not exists bottles_batch_idx on public.bottles(batch_id);

alter table public.invoice_documents enable row level security;
alter table public.patient_contracts enable row level security;

grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.prescriptions to authenticated;
grant select, insert, update, delete on public.bottles to authenticated;
grant select, insert, update, delete on public.patient_assessments to authenticated;
grant select, insert, update, delete on public.batches to authenticated;
grant select, insert, update, delete on public.batch_items to authenticated;
grant select, insert, update, delete on public.invoice_documents to authenticated;
grant select, insert, update, delete on public.patient_contracts to authenticated;
grant insert on public.audit_logs to authenticated;

drop policy if exists "secretaria gerencia notas fiscais" on public.invoice_documents;
drop policy if exists "paciente le notas fiscais" on public.invoice_documents;
create policy "secretaria gerencia notas fiscais" on public.invoice_documents
for all to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
)
with check (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
);
create policy "paciente le notas fiscais" on public.invoice_documents
for select to authenticated
using (
  exists (
    select 1 from public.patients patient
    where patient.id = invoice_documents.patient_id and patient.auth_user_id = auth.uid()
  )
);

drop policy if exists "secretaria gerencia contratos" on public.patient_contracts;
drop policy if exists "paciente le contrato" on public.patient_contracts;
create policy "secretaria gerencia contratos" on public.patient_contracts
for all to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
)
with check (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
);
create policy "paciente le contrato" on public.patient_contracts
for select to authenticated
using (
  exists (
    select 1 from public.patients patient
    where patient.id = patient_contracts.patient_id and patient.auth_user_id = auth.uid()
  )
);

drop policy if exists "secretaria atualiza avaliacoes" on public.patient_assessments;
create policy "secretaria atualiza avaliacoes" on public.patient_assessments
for update to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
)
with check (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
);

drop policy if exists "secretaria registra auditoria" on public.audit_logs;
create policy "secretaria registra auditoria" on public.audit_logs
for insert to authenticated
with check (
  clinic_id = public.current_clinic_id()
  and actor_id = auth.uid()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
);
