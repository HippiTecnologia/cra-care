-- Identifica cada pagamento pelo tratamento correto sem alterar os registros existentes.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.payments
  add column if not exists treatment text;

alter table public.payments
  drop constraint if exists payments_treatment_check;

alter table public.payments
  add constraint payments_treatment_check
  check (treatment is null or treatment in ('Rinite', 'Imunobacteriana'));

create index if not exists payments_patient_treatment_idx
  on public.payments (patient_id, treatment, due_at);
