-- CRA Care / Hippi Care: estrutura inicial multiusuário e multi-clínica.
-- Execute este arquivo inteiro no Supabase: SQL Editor > New query > Run.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('super_admin', 'admin', 'secretaria', 'medico', 'laboratorio', 'paciente');
exception when duplicate_object then null;
end $$;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  role public.app_role not null,
  full_name text not null,
  crm text,
  specialty text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  doctor_profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  cpf text not null,
  birth_date date not null,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  treatment jsonb not null default '{}'::jsonb,
  financial jsonb not null default '{}'::jsonb,
  status text not null default 'em-conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, cpf)
);

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_profile_id uuid references public.profiles(id) on delete set null,
  content jsonb not null,
  signature_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.bottles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  bottle_number integer not null,
  received_at date,
  started_at date,
  completed_at date,
  status text not null default 'recebido',
  notes text,
  unique (patient_id, bottle_number)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  installment_number integer not null default 1,
  installment_count integer not null default 1,
  amount numeric(12,2) not null check (amount >= 0),
  due_at date,
  paid_at date,
  payment_method text not null,
  status text not null default 'pendente',
  asaas_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_assessments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  frequency text,
  severity text,
  medication_frequency text,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  status text not null default 'rascunho',
  laboratory text,
  created_at timestamptz not null default now()
);

create table if not exists public.batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  bottles integer not null default 1,
  prepared_at timestamptz,
  checked_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists patients_clinic_cpf_idx on public.patients(clinic_id, cpf);
create index if not exists payments_clinic_due_idx on public.payments(clinic_id, due_at);
create index if not exists prescriptions_patient_idx on public.prescriptions(patient_id, created_at desc);
create index if not exists bottles_patient_idx on public.bottles(patient_id, bottle_number);

create or replace function public.current_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select clinic_id from public.profiles where id = auth.uid()
$$;

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.prescriptions enable row level security;
alter table public.bottles enable row level security;
alter table public.payments enable row level security;
alter table public.patient_assessments enable row level security;
alter table public.batches enable row level security;
alter table public.batch_items enable row level security;
alter table public.audit_logs enable row level security;

create policy "clinic members read clinic" on public.clinics for select to authenticated using (id = public.current_clinic_id());
create policy "profile owner read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profile owner update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "staff read patients" on public.patients for select to authenticated using (
  clinic_id = public.current_clinic_id() and (auth.uid() = auth_user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin','secretaria','medico','laboratorio')))
);
create policy "staff manage patients" on public.patients for all to authenticated using (
  clinic_id = public.current_clinic_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin','secretaria','medico'))
) with check (
  clinic_id = public.current_clinic_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin','secretaria','medico'))
);

create policy "clinic access prescriptions" on public.prescriptions for all to authenticated using (clinic_id = public.current_clinic_id()) with check (clinic_id = public.current_clinic_id());
create policy "clinic access bottles" on public.bottles for all to authenticated using (clinic_id = public.current_clinic_id()) with check (clinic_id = public.current_clinic_id());
create policy "clinic access payments" on public.payments for all to authenticated using (clinic_id = public.current_clinic_id()) with check (clinic_id = public.current_clinic_id());
create policy "clinic access assessments" on public.patient_assessments for all to authenticated using (clinic_id = public.current_clinic_id()) with check (clinic_id = public.current_clinic_id());
create policy "clinic access batches" on public.batches for all to authenticated using (clinic_id = public.current_clinic_id()) with check (clinic_id = public.current_clinic_id());
create policy "clinic access batch items" on public.batch_items for all to authenticated using (exists (select 1 from public.batches b where b.id = batch_id and b.clinic_id = public.current_clinic_id())) with check (exists (select 1 from public.batches b where b.id = batch_id and b.clinic_id = public.current_clinic_id()));
create policy "admin reads audit" on public.audit_logs for select to authenticated using (clinic_id = public.current_clinic_id() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin')));

insert into public.clinics (name, slug)
values ('Centro de Rinite e Alergia', 'cra-care')
on conflict (slug) do nothing;
