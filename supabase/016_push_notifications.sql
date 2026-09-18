-- Dispositivos autorizados para receber notificações push do CRA Care.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_patient_id_idx on public.push_subscriptions(patient_id);
alter table public.push_subscriptions enable row level security;
-- Não há política pública: a leitura e o envio ocorrem apenas pelas rotas seguras do CRA Care.
