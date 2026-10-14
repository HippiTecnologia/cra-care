-- Volume de frascos, honorários por 4/8 mL e avisos internos de conclusão.
-- A migration é aditiva: registros antigos permanecem nulos e seus snapshots não mudam.

alter table public.prescriptions
  add column if not exists bottle_volume_ml smallint;

alter table public.batch_items
  add column if not exists bottle_volume_ml smallint;

alter table public.bottles
  add column if not exists volume_ml smallint;

do $$ begin
  alter table public.prescriptions add constraint prescriptions_bottle_volume_check
    check (bottle_volume_ml is null or bottle_volume_ml in (4, 6, 8, 10, 12));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.batch_items add constraint batch_items_bottle_volume_check
    check (bottle_volume_ml is null or bottle_volume_ml in (4, 6, 8, 10, 12));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.bottles add constraint bottles_volume_check
    check (volume_ml is null or volume_ml in (4, 6, 8, 10, 12));
exception when duplicate_object then null;
end $$;

alter table public.doctor_commission_settings
  add column if not exists commission_type text,
  add column if not exists commission_4ml_value numeric(12,2),
  add column if not exists commission_8ml_value numeric(12,2);

do $$ begin
  alter table public.doctor_commission_settings add constraint doctor_commission_type_check
    check (commission_type is null or commission_type in ('fixed', 'percentage'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.doctor_commission_settings add constraint doctor_commission_values_check
    check (
      (commission_4ml_value is null or commission_4ml_value >= 0)
      and (commission_8ml_value is null or commission_8ml_value >= 0)
      and (
        commission_4ml_value is null
        or commission_8ml_value is null
        or commission_4ml_value > commission_8ml_value
      )
    );
exception when duplicate_object then null;
end $$;

create table if not exists public.team_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  doctor_profile_id uuid references public.profiles(id) on delete set null,
  event_key text not null,
  title text not null,
  message text not null,
  href text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.profiles(id) on delete set null,
  unique (clinic_id, event_key)
);

create index if not exists team_notifications_clinic_created_idx
  on public.team_notifications(clinic_id, created_at desc);

alter table public.team_notifications enable row level security;
grant select, update on public.team_notifications to authenticated;

drop policy if exists "equipe consulta notificacoes internas" on public.team_notifications;
create policy "equipe consulta notificacoes internas" on public.team_notifications
for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'laboratorio')
);

drop policy if exists "equipe marca notificacoes internas" on public.team_notifications;
create policy "equipe marca notificacoes internas" on public.team_notifications
for update to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'laboratorio')
)
with check (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'laboratorio')
);

create or replace function public.notify_team_patient_concluded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  doctor_name text;
begin
  if new.status = 'concluido'
    and old.status is distinct from 'concluido'
    and public.current_app_role() = 'medico'
  then
    select full_name into doctor_name
    from public.profiles
    where id = new.doctor_profile_id;

    insert into public.team_notifications (
      clinic_id, patient_id, doctor_profile_id, event_key, title, message, href, metadata
    ) values (
      new.clinic_id,
      new.id,
      new.doctor_profile_id,
      'patient-concluded:' || new.id::text,
      'Tratamento concluído',
      new.full_name || ' foi concluído por ' || coalesce(doctor_name, 'Médico responsável') || '.',
      '/secretaria/cadastros#' || new.id::text,
      jsonb_build_object('patientName', new.full_name, 'doctorName', coalesce(doctor_name, 'Médico responsável'))
    )
    on conflict (clinic_id, event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_notify_team_concluded on public.patients;
create trigger patients_notify_team_concluded
after update of status on public.patients
for each row execute function public.notify_team_patient_concluded();
