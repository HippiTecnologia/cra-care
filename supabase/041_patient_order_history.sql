-- Preserva pedidos históricos importados de planilhas sem tratá-los como
-- receitas assinadas ou como lançamentos financeiros atuais.
create table public.patient_order_history (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  source_file text not null,
  source_row_number integer not null check (source_row_number > 0),
  source_fingerprint text not null,
  source_record jsonb not null,
  imported_at timestamptz not null default now(),
  constraint patient_order_history_source_row_unique
    unique (clinic_id, source_file, source_row_number),
  constraint patient_order_history_fingerprint_unique
    unique (clinic_id, patient_id, source_fingerprint)
);

create index patient_order_history_patient_idx
  on public.patient_order_history (clinic_id, patient_id, source_row_number);

alter table public.patient_order_history enable row level security;

create policy "equipe consulta historico de pedidos"
  on public.patient_order_history
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.can_access_patient_record(patient_id)
  );

revoke all on public.patient_order_history from anon, authenticated;
grant select on public.patient_order_history to authenticated;

notify pgrst, 'reload schema';
