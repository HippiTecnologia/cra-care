-- Envio em segundo plano dos lembretes que o proprio paciente agenda.
-- O cron existente chama /api/notifications/dispatch a cada minuto.

create table if not exists public.patient_treatment_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  treatment text not null check (treatment in ('rinite', 'imunobacteriana')),
  local_date date not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  push_sent_count integer not null default 0 check (push_sent_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, treatment, local_date)
);

create index if not exists patient_treatment_reminder_deliveries_pending_idx
  on public.patient_treatment_reminder_deliveries (next_attempt_at, scheduled_for)
  where status = 'pending';

create index if not exists patient_treatment_reminder_deliveries_updated_idx
  on public.patient_treatment_reminder_deliveries (updated_at)
  where status = 'sending';

alter table public.patient_treatment_reminder_deliveries enable row level security;
revoke all on public.patient_treatment_reminder_deliveries from public, anon, authenticated;
grant select, insert, update on public.patient_treatment_reminder_deliveries to service_role;

-- Insere uma entrega por paciente/tratamento/dia e reserva as pendentes em uma
-- unica operacao. O indice unico evita duplicidade entre execucoes concorrentes.
create or replace function public.claim_due_patient_treatment_reminders(p_limit integer default 100)
returns setof public.patient_treatment_reminder_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  update public.patient_treatment_reminder_deliveries
  set status = 'failed',
      last_error = coalesce(last_error, 'O envio foi interrompido após várias tentativas.'),
      updated_at = v_now
  where status = 'sending'
    and attempts >= 5
    and updated_at < v_now - interval '10 minutes';

  with active_treatments as (
    select distinct
      bottle.patient_id,
      case
        when lower(coalesce(
          nullif(bottle.metadata ->> 'treatment', ''),
          nullif(prescription.content ->> 'treatment', ''),
          nullif(patient.treatment ->> 'name', ''),
          nullif(patient.treatment ->> 'treatment', ''),
          ''
        )) like '%bacteriana%'
          then 'imunobacteriana'
        else 'rinite'
      end as treatment
    from public.bottles as bottle
    left join public.prescriptions as prescription on prescription.id = bottle.prescription_id
    left join public.patients as patient on patient.id = bottle.patient_id
    where bottle.completed_at is null
      and (bottle.started_at is not null or bottle.status = 'em-uso')
      and coalesce(bottle.metadata ->> 'manuallyDeleted', 'false') <> 'true'
  ), settings as (
    select
      portal.patient_id,
      portal.clinic_id,
      portal.reminders,
      track.treatment,
      case
        when portal.reminders #> array['byTreatment', track.treatment] is null then portal.reminders
        else portal.reminders #> array['byTreatment', track.treatment]
      end as reminder
    from public.patient_portal_settings as portal
    join public.patients as patient
      on patient.id = portal.patient_id
     and patient.clinic_id = portal.clinic_id
     and patient.archived_at is null
     and patient.auth_user_id is not null
     and exists (
       select 1
       from public.patient_contracts as contract
       where contract.patient_id = patient.id
         and contract.signed_at is not null
     )
    join active_treatments as active
      on active.patient_id = portal.patient_id
    cross join (values ('rinite'::text), ('imunobacteriana'::text)) as track(treatment)
    where active.treatment = track.treatment
  ), zoned_settings as (
    select settings.*, timezone.name as timezone_name
    from settings
    join lateral (
      select candidate.name
      from pg_catalog.pg_timezone_names as candidate
      where candidate.name in (
        nullif(settings.reminder ->> 'timeZone', ''),
        nullif(settings.reminders ->> 'timeZone', ''),
        'America/Sao_Paulo'
      )
      order by case
        when candidate.name = nullif(settings.reminder ->> 'timeZone', '') then 1
        when candidate.name = nullif(settings.reminders ->> 'timeZone', '') then 2
        else 3
      end
      limit 1
    ) as timezone on true
  ), local_schedules as (
    select
      zoned_settings.patient_id,
      zoned_settings.clinic_id,
      zoned_settings.treatment,
      case
        when zoned_settings.reminder ->> 'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          then (zoned_settings.reminder ->> 'time')::time
        else null::time
      end as reminder_time,
      zoned_settings.timezone_name,
      v_now at time zone zoned_settings.timezone_name as local_now
    from zoned_settings
    where zoned_settings.reminder ->> 'enabled' = 'true'
      and zoned_settings.reminder ->> 'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and pg_catalog.jsonb_typeof(zoned_settings.reminder -> 'weekdays') = 'array'
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(
          case
            when pg_catalog.jsonb_typeof(zoned_settings.reminder -> 'weekdays') = 'array'
              then zoned_settings.reminder -> 'weekdays'
            else '[]'::jsonb
          end
        ) as weekday(value)
        where weekday.value ~ '^[0-6]$'
          and weekday.value::integer = extract(dow from v_now at time zone zoned_settings.timezone_name)::integer
      )
  ), due as (
    select
      local_schedules.patient_id,
      local_schedules.clinic_id,
      local_schedules.treatment,
      local_schedules.local_now::date as local_date,
      (local_schedules.local_now::date + local_schedules.reminder_time)
        at time zone local_schedules.timezone_name as scheduled_for
    from local_schedules
    where local_schedules.reminder_time is not null
      and local_schedules.local_now >= local_schedules.local_now::date + local_schedules.reminder_time
      and local_schedules.local_now < local_schedules.local_now::date + local_schedules.reminder_time + interval '5 minutes'
    order by local_schedules.patient_id, local_schedules.treatment
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  )
  insert into public.patient_treatment_reminder_deliveries as current_delivery (
    clinic_id, patient_id, treatment, local_date, scheduled_for
  )
  select due.clinic_id, due.patient_id, due.treatment, due.local_date, due.scheduled_for
  from due
  on conflict (patient_id, treatment, local_date) do nothing;

  return query
  with due as (
    select delivery.id
    from public.patient_treatment_reminder_deliveries as delivery
    where delivery.attempts < 5
      and (
        (delivery.status = 'pending' and delivery.next_attempt_at <= v_now)
        or (delivery.status = 'sending' and delivery.updated_at < v_now - interval '10 minutes')
      )
    order by delivery.scheduled_for, delivery.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ), claimed as (
    update public.patient_treatment_reminder_deliveries as delivery
    set status = 'sending',
        attempts = delivery.attempts + 1,
        updated_at = v_now
    from due
    where delivery.id = due.id
    returning delivery.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_due_patient_treatment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_patient_treatment_reminders(integer) to service_role;

notify pgrst, 'reload schema';
