-- Patients created by a physician in the app remain in the Laudo lane until a
-- vaccine prescription is saved. Imports run outside that physician session
-- keep the status supplied by the import.
create or replace function public.set_doctor_new_patient_kanban_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.doctor_profile_id = auth.uid() then
    new.status := 'laudo';
  end if;

  return new;
end;
$$;

-- Correct only current "Com pedido" records that have a nursing report but
-- no prescription. The imported spreadsheet history remains untouched.
update public.patients as patient
set status = 'laudo', updated_at = now()
where patient.status = 'com-pedido'
  and exists (
    select 1
    from public.nursing_reports as report
    where report.patient_id = patient.id
      and report.clinic_id = patient.clinic_id
  )
  and not exists (
    select 1
    from public.prescriptions as prescription
    where prescription.patient_id = patient.id
      and prescription.clinic_id = patient.clinic_id
  )
  and not exists (
    select 1
    from public.patient_order_history as imported_order
    where imported_order.patient_id = patient.id
      and imported_order.clinic_id = patient.clinic_id
  );
