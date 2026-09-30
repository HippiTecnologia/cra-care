-- Paciente com médico e tratamento vinculados não é paciente exclusivo de laudo.
-- Ele deve aparecer no Kanban em "Com pedido", mesmo se a Enfermagem
-- participar da finalização do cadastro.
create or replace function public.set_doctor_new_patient_kanban_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.doctor_profile_id is not null
    and coalesce(new.treatment, '{}'::jsonb) <> '{}'::jsonb
  ) or exists (
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

-- Corrige somente os pacientes já vinculados a um médico e tratamento
-- que foram classificados incorretamente como laudo.
update public.patients
set status = 'com-pedido', updated_at = now()
where status = 'laudo'
  and doctor_profile_id is not null
  and coalesce(treatment, '{}'::jsonb) <> '{}'::jsonb;
