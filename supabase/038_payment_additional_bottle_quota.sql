-- Registra quantos frascos adicionais cada lançamento de pagamento libera.
-- O limite inicial continua sendo treatmentPayments.bottlesIncluded; esta coluna
-- soma novas quantidades pagas sem sobrescrever o histórico da condição original.
alter table public.payments
  add column if not exists additional_bottles integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_additional_bottles_nonnegative'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_additional_bottles_nonnegative
      check (additional_bottles >= 0);
  end if;
end;
$$;

comment on column public.payments.additional_bottles is
  'Quantidade adicional de frascos liberada por este pagamento; zero para lançamentos sem nova cota.';

notify pgrst, 'reload schema';
