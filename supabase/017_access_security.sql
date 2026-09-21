-- Segurança de acesso e administração de usuários.
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists access_status text not null default 'ativo',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null,
  add column if not exists last_login_at timestamptz;

alter table public.patients
  add column if not exists access_status text not null default 'ativo',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null,
  add column if not exists last_login_at timestamptz;

alter table public.profiles drop constraint if exists profiles_access_status_check;
alter table public.profiles add constraint profiles_access_status_check
  check (access_status in ('ativo', 'bloqueado', 'desativado'));
alter table public.patients drop constraint if exists patients_access_status_check;
alter table public.patients add constraint patients_access_status_check
  check (access_status in ('ativo', 'bloqueado', 'desativado'));

create table if not exists public.login_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_failed_at timestamptz,
  locked_at timestamptz,
  last_login_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists login_security_clinic_idx on public.login_security(clinic_id, locked_at);
create index if not exists profiles_access_status_idx on public.profiles(clinic_id, access_status);
create index if not exists patients_access_status_idx on public.patients(clinic_id, access_status);

alter table public.login_security enable row level security;
grant select on public.login_security to authenticated;

drop policy if exists "secretaria consulta seguranca de acesso" on public.login_security;
create policy "secretaria consulta seguranca de acesso" on public.login_security
for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria')
);

comment on table public.login_security is 'Contagem de tentativas inválidas de pacientes. Ao atingir 3, o acesso é bloqueado até a Secretaria redefinir a senha.';
comment on column public.profiles.deactivation_reason is 'Motivo informado pela Secretaria ao desativar o acesso.';
comment on column public.patients.deactivation_reason is 'Motivo informado pela Secretaria ao desativar o acesso.';
