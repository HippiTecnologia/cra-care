alter table public.payments
  add column if not exists historical_import boolean not null default false;

comment on column public.payments.historical_import is
  'Marca pagamentos importados como histórico, sem somá-los ao contrato financeiro atual.';

notify pgrst, 'reload schema';
