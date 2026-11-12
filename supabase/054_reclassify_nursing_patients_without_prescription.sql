-- Keep nursing-report patients without a vaccine prescription in the Laudo lane.
-- Spreadsheet imports with historical orders remain eligible for the Secretary.
update public.patients as patient
set status = 'laudo', updated_at = now()
where patient.status in ('com-pedido', 'em-conversa')
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
  )
returning patient.id, patient.full_name, patient.status;
