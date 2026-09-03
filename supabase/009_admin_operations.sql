-- Etapa 4: operação real do painel Administrativo.
-- Mantém versões históricas de métodos, snapshots de vendas e baixas de comissão.

create table if not exists public.admin_treatment_methods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  method_key text not null,
  name text not null,
  category text not null,
  value numeric(12,2) not null default 0 check (value >= 0),
  cash_value numeric(12,2),
  payment_method text not null,
  max_installments integer not null default 1 check (max_installments > 0),
  billing_period_months integer not null default 1 check (billing_period_months > 0),
  discount_type text not null default 'valor',
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, method_key, version)
);

create table if not exists public.admin_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  description text not null,
  category text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, description)
);

create table if not exists public.doctor_commission_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doctor_profile_id uuid not null references public.profiles(id) on delete cascade,
  commission_per_bottle numeric(12,2) not null default 68 check (commission_per_bottle >= 0),
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, doctor_profile_id)
);

create table if not exists public.admin_sales (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'ativa',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, patient_id)
);

create table if not exists public.admin_commission_payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  installment_key text not null,
  sale_id uuid not null references public.admin_sales(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.profiles(id) on delete set null,
  unique (clinic_id, installment_key)
);

create index if not exists admin_methods_clinic_idx on public.admin_treatment_methods(clinic_id, method_key, version desc);
create index if not exists admin_costs_clinic_idx on public.admin_fixed_costs(clinic_id, active);
create index if not exists doctor_commissions_clinic_idx on public.doctor_commission_settings(clinic_id, doctor_profile_id);
create index if not exists admin_sales_clinic_idx on public.admin_sales(clinic_id, created_at desc);
create index if not exists admin_commissions_clinic_idx on public.admin_commission_payments(clinic_id, paid_at desc);

alter table public.admin_treatment_methods enable row level security;
alter table public.admin_fixed_costs enable row level security;
alter table public.doctor_commission_settings enable row level security;
alter table public.admin_sales enable row level security;
alter table public.admin_commission_payments enable row level security;

grant select, insert, update, delete on public.admin_treatment_methods to authenticated;
grant select, insert, update, delete on public.admin_fixed_costs to authenticated;
grant select, insert, update, delete on public.doctor_commission_settings to authenticated;
grant select, insert, update, delete on public.admin_sales to authenticated;
grant select, insert, update, delete on public.admin_commission_payments to authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "adm gerencia metodos" on public.admin_treatment_methods;
drop policy if exists "secretaria consulta metodos" on public.admin_treatment_methods;
create policy "adm gerencia metodos" on public.admin_treatment_methods
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'));
create policy "secretaria consulta metodos" on public.admin_treatment_methods
for select to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() = 'secretaria');

drop policy if exists "adm gerencia custos" on public.admin_fixed_costs;
create policy "adm gerencia custos" on public.admin_fixed_costs
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists "adm gerencia comissao medica" on public.doctor_commission_settings;
create policy "adm gerencia comissao medica" on public.doctor_commission_settings
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists "adm gerencia vendas" on public.admin_sales;
create policy "adm gerencia vendas" on public.admin_sales
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists "adm gerencia pagamentos de comissao" on public.admin_commission_payments;
create policy "adm gerencia pagamentos de comissao" on public.admin_commission_payments
for all to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'))
with check (clinic_id = public.current_clinic_id() and public.current_app_role() in ('super_admin', 'admin'));

drop policy if exists "adm registra auditoria" on public.audit_logs;
create policy "adm registra auditoria" on public.audit_logs
for insert to authenticated
with check (
  clinic_id = public.current_clinic_id()
  and actor_id = auth.uid()
  and public.current_app_role() in ('super_admin', 'admin')
);

insert into public.admin_treatment_methods (
  clinic_id, method_key, name, category, value, cash_value, payment_method,
  max_installments, billing_period_months, discount_type, discount_value, active, version
)
select clinic.id, seed.method_key, seed.name, seed.category, seed.value, seed.cash_value,
  seed.payment_method, seed.max_installments, seed.billing_period_months, 'valor',
  greatest(0, coalesce(seed.value_total, seed.value) - coalesce(seed.cash_value, coalesce(seed.value_total, seed.value))), true, 1
from public.clinics clinic
cross join (values
  ('metodo-1-0', 'Método 1.0', 'Método', 320::numeric, null::numeric, 'Asaas', 1, 1, 320::numeric),
  ('metodo-1-1', 'Método 1.1', 'Método', 320::numeric, null::numeric, 'Cartão de crédito', 1, 1, 320::numeric),
  ('recorrente-1-0', 'Recorrente 1.0', 'Recorrente', 270::numeric, null::numeric, 'Asaas', 6, 6, 1620::numeric),
  ('recorrente-2-0', 'Recorrente 2.0', 'Recorrente', 290::numeric, null::numeric, 'Asaas', 6, 6, 1740::numeric),
  ('recorrente-3-0', 'Recorrente 3.0', 'Recorrente', 320::numeric, null::numeric, 'Asaas', 6, 6, 1920::numeric),
  ('seis-meses-1-0', '6 meses 1.0', 'Plano de 6 meses', 1620::numeric, 1500::numeric, 'Cartão de crédito', 6, 6, 1620::numeric),
  ('seis-meses-2-0', '6 meses 2.0', 'Plano de 6 meses', 1740::numeric, 1620::numeric, 'Cartão de crédito', 6, 6, 1740::numeric),
  ('seis-meses-3-0', '6 meses 3.0', 'Plano de 6 meses', 1920::numeric, 1790::numeric, 'Cartão de crédito', 6, 6, 1920::numeric),
  ('por-frasco-1-0', 'Por frasco 1.0', 'Por frasco', 500::numeric, null::numeric, 'Cartão de crédito', 2, 1, 500::numeric)
) as seed(method_key, name, category, value, cash_value, payment_method, max_installments, billing_period_months, value_total)
on conflict (clinic_id, method_key, version) do nothing;

insert into public.admin_fixed_costs (clinic_id, description, category, amount, active)
select clinic.id, seed.description, seed.category, seed.amount, true
from public.clinics clinic
cross join (values
  ('Insumos e frasco', 'Produção', 72::numeric),
  ('Embalagem refrigerada', 'Logística', 18::numeric),
  ('Custo operacional por tratamento', 'Operacional', 45::numeric)
) as seed(description, category, amount)
on conflict (clinic_id, description) do nothing;

insert into public.doctor_commission_settings (clinic_id, doctor_profile_id, commission_per_bottle, active)
select profile.clinic_id, profile.id, 68, true
from public.profiles profile
where profile.role = 'medico' and profile.clinic_id is not null
on conflict (clinic_id, doctor_profile_id) do nothing;
