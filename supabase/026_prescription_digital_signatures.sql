-- Sessões de assinatura ICP-Brasil de receitas. Dados temporários do OAuth
-- ficam inacessíveis ao cliente e são apagados após a conclusão da sessão.
create table if not exists public.prescription_digital_signatures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  prescription_id uuid not null unique references public.prescriptions(id) on delete cascade,
  doctor_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'vidaas' check (provider in ('vidaas')),
  status text not null default 'awaiting_authorization' check (status in ('awaiting_authorization', 'authorizing', 'signed', 'rejected', 'expired', 'failed')),
  authorization_state text not null unique,
  pkce_verifier text not null,
  unsigned_pdf_path text not null,
  signed_pdf_path text,
  document_sha256 text not null,
  certificate_alias text,
  error_message text,
  expires_at timestamptz not null,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prescription_digital_signatures_doctor_idx on public.prescription_digital_signatures(doctor_profile_id, created_at desc);
alter table public.prescription_digital_signatures enable row level security;

drop policy if exists "medico consulta suas assinaturas digitais" on public.prescription_digital_signatures;
create policy "medico consulta suas assinaturas digitais" on public.prescription_digital_signatures
for select to authenticated
using (doctor_profile_id = auth.uid() and clinic_id = public.current_clinic_id());
