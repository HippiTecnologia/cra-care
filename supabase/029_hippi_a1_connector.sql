-- Vínculo seguro entre um médico e a parte pública do certificado A1.
-- Nunca armazena P12/PFX, senha, PIN ou chave privada.

create table if not exists public.doctor_a1_certificates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doctor_user_id uuid not null references public.profiles(id) on delete cascade,
  certificate_fingerprint text not null,
  certificate_serial text not null,
  certificate_subject text not null,
  certificate_issuer text not null,
  active boolean not null default true,
  enrolled_by uuid references public.profiles(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (clinic_id, doctor_user_id, certificate_fingerprint)
);

create index if not exists doctor_a1_certificates_lookup_idx
  on public.doctor_a1_certificates (clinic_id, doctor_user_id, certificate_fingerprint)
  where active = true;

alter table public.doctor_a1_certificates enable row level security;

drop policy if exists "certificados a1 visiveis pelo medico ou admin" on public.doctor_a1_certificates;
create policy "certificados a1 visiveis pelo medico ou admin" on public.doctor_a1_certificates for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and (
    doctor_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.clinic_id = doctor_a1_certificates.clinic_id and p.role::text in ('admin', 'super_admin')
    )
  )
);
