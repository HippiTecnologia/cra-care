-- Um paciente criado inicialmente pela Enfermagem fica em status "laudo".
-- Quando um médico assume esse paciente e salva a primeira receita, ele deve
-- entrar no Kanban da Secretaria em "Com pedido". A regra é restrita a esse
-- status para não reposicionar pacientes já organizados manualmente no Kanban.
create or replace function public.move_nursing_patient_to_order_kanban()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.patients
  set status = 'com-pedido', updated_at = now()
  where id = new.patient_id
    and clinic_id = new.clinic_id
    and status = 'laudo'
    and doctor_profile_id = new.doctor_profile_id;

  return new;
end;
$$;

drop trigger if exists nursing_patient_first_medical_prescription_to_kanban on public.prescriptions;
create trigger nursing_patient_first_medical_prescription_to_kanban
after insert on public.prescriptions
for each row
execute function public.move_nursing_patient_to_order_kanban();
