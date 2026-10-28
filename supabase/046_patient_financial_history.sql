-- Guarda o snapshot financeiro em cada lançamento, sem reescrever os dados históricos existentes.
alter table public.payments
  add column if not exists acquisition_method_id text,
  add column if not exists acquisition_method text,
  add column if not exists acquisition_method_version integer,
  add column if not exists payment_condition text,
  add column if not exists installment_value numeric(12,2),
  add column if not exists registered_at date;

update public.payments
set registered_at = coalesce(paid_at, created_at::date),
    installment_value = coalesce(installment_value, amount)
where registered_at is null or installment_value is null;

-- Liga a nota ao pagamento sem apagar o documento quando um lançamento for removido.
alter table public.invoice_documents
  add column if not exists payment_id uuid;

do $$ begin
  alter table public.invoice_documents
    add constraint invoice_documents_payment_id_fkey
    foreign key (payment_id) references public.payments(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists invoice_documents_clinic_payment_idx
  on public.invoice_documents (clinic_id, payment_id)
  where payment_id is not null;

notify pgrst, 'reload schema';
