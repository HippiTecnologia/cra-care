-- Todo paciente criado por um médico começa no Kanban em "Com pedido".
-- A regra vale apenas na criação e não altera pacientes existentes nem receitas.
create or replace function public.set_doctor_new_patient_kanban_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'medico'
  ) then
    new.status := 'com-pedido';
  end if;

  return new;
end;
$$;

drop trigger if exists doctor_new_patient_starts_with_order on public.patients;
create trigger doctor_new_patient_starts_with_order
before insert on public.patients
for each row
execute function public.set_doctor_new_patient_kanban_status();
