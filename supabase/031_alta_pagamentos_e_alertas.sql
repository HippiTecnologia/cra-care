-- Fluxo de alta médica, pagamento vinculado ao frasco e alerta de acompanhamento.
-- Execute após 030_bottle_volume_commissions_team_notifications.sql.

alter table public.payments
  add column if not exists bottle_reference text;

create index if not exists payments_patient_bottle_reference_idx
  on public.payments(patient_id, bottle_reference)
  where bottle_reference is not null;

create or replace function public.notify_team_patient_concluded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  doctor_name text;
begin
  if new.status = 'em-alta'
    and old.status is distinct from 'em-alta'
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
      'patient-high-discharge:' || new.id::text,
      'Paciente em alta',
      new.full_name || ' foi colocado em alta por ' || coalesce(doctor_name, 'Médico responsável') || '. A Secretaria deve concluir o cadastro.',
      '/secretaria/cadastros#' || new.id::text,
      jsonb_build_object('patientName', new.full_name, 'doctorName', coalesce(doctor_name, 'Médico responsável'), 'status', 'em-alta')
    ) on conflict (clinic_id, event_key) do nothing;
  end if;
  return new;
end;
$$;
