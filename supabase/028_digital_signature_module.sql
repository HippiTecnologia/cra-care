-- Módulo independente de assinatura digital do CRA Care.
-- Não armazena PIN, senha, PFX, token OAuth ou chave privada de certificado.

create table if not exists public.signature_provider_configs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null check (provider in ('vidaas', 'soluti', 'a1', 'a3', 'cloud', 'sandbox')),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  enabled boolean not null default false,
  api_base_url text,
  authorization_url text,
  client_id_env_key text,
  client_secret_env_key text,
  webhook_secret_env_key text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, provider)
);

create table if not exists public.signature_document_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  document_type text not null,
  label text not null,
  signature_required boolean not null default false,
  allowed_providers text[] not null default array['vidaas']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, document_type)
);

create table if not exists public.digital_signatures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  document_type text not null,
  document_id uuid not null,
  document_name text not null,
  signer_user_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  provider text not null check (provider in ('vidaas', 'soluti', 'a1', 'a3', 'cloud', 'sandbox')),
  certificate_type text not null check (certificate_type in ('a1', 'a3', 'cloud')),
  provider_transaction_id text,
  provider_signature_id text,
  provider_state text unique,
  provider_data jsonb not null default '{}'::jsonb,
  original_storage_path text not null,
  signed_storage_path text,
  document_hash text not null,
  signed_document_hash text,
  validation_code text not null unique,
  status text not null default 'draft' check (status in ('draft', 'awaiting_signature', 'authentication_pending', 'signing', 'signed', 'rejected', 'cancelled', 'expired', 'error', 'invalid')),
  validation_result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  requested_at timestamptz not null default now(),
  authenticated_at timestamptz,
  signed_at timestamptz,
  validated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, document_type, document_id, signer_user_id)
);

create table if not exists public.signature_audit_logs (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null references public.digital_signatures(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  event text not null,
  status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  provider text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.signature_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  payload_hash text not null,
  signature_id uuid references public.digital_signatures(id) on delete set null,
  processed_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create index if not exists digital_signatures_clinic_status_idx on public.digital_signatures(clinic_id, status, created_at desc);
create index if not exists digital_signatures_signer_idx on public.digital_signatures(signer_user_id, created_at desc);
create index if not exists signature_audit_logs_signature_idx on public.signature_audit_logs(signature_id, created_at);

alter table public.signature_provider_configs enable row level security;
alter table public.signature_document_rules enable row level security;
alter table public.digital_signatures enable row level security;
alter table public.signature_audit_logs enable row level security;
alter table public.signature_webhook_events enable row level security;

drop policy if exists "assinaturas visiveis por funcao" on public.digital_signatures;
create policy "assinaturas visiveis por funcao" on public.digital_signatures for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and (
    signer_user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.clinic_id = digital_signatures.clinic_id and p.role::text in ('secretaria', 'admin', 'super_admin'))
  )
);

drop policy if exists "auditoria visivel por funcao" on public.signature_audit_logs;
create policy "auditoria visivel por funcao" on public.signature_audit_logs for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.clinic_id = signature_audit_logs.clinic_id and p.role::text in ('medico', 'admin', 'super_admin'))
);

drop policy if exists "regras de assinatura visiveis" on public.signature_document_rules;
create policy "regras de assinatura visiveis" on public.signature_document_rules for select to authenticated
using (clinic_id = public.current_clinic_id());

drop policy if exists "configuracao de assinatura visivel ao admin" on public.signature_provider_configs;
create policy "configuracao de assinatura visivel ao admin" on public.signature_provider_configs for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.clinic_id = signature_provider_configs.clinic_id and p.role::text in ('admin', 'super_admin'))
);

insert into public.signature_document_rules (clinic_id, document_type, label, signature_required, allowed_providers)
select id, 'prescription', 'Receita médica', true, array['vidaas', 'soluti', 'a1', 'a3', 'cloud']::text[] from public.clinics
on conflict (clinic_id, document_type) do nothing;
