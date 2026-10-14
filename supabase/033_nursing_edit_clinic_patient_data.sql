-- A Enfermagem pode editar dados cadastrais de qualquer paciente da própria clínica
-- pela área de exames, sem ampliar as permissões das demais áreas ou perfis.

drop policy if exists "enfermagem gerencia seus pacientes" on public.patients;
drop policy if exists "enfermagem cria seus pacientes" on public.patients;
drop policy if exists "enfermagem exclui seus pacientes" on public.patients;

create policy "enfermagem cria seus pacientes"
on public.patients
for insert to authenticated
with check (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'enfermagem'
  and nursing_profile_id = auth.uid()
);

create policy "enfermagem exclui seus pacientes"
on public.patients
for delete to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'enfermagem'
  and nursing_profile_id = auth.uid()
);

create or replace function public.update_nursing_patient_profile_fields(
  p_patient_id uuid,
  p_full_name text,
  p_cpf text,
  p_birth_date date,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() <> 'enfermagem' then
    raise exception 'Somente a Enfermagem pode editar dados cadastrais por esta operação.';
  end if;

  update public.patients
  set full_name = trim(p_full_name),
      cpf = regexp_replace(p_cpf, '[^0-9]', '', 'g'),
      birth_date = p_birth_date,
      phone = nullif(trim(p_phone), ''),
      updated_at = now()
  where id = p_patient_id
    and clinic_id = public.current_clinic_id();

  if not found then
    raise exception 'Paciente não encontrado nesta clínica.';
  end if;
end;
$$;

revoke all on function public.update_nursing_patient_profile_fields(uuid, text, text, date, text) from public;
grant execute on function public.update_nursing_patient_profile_fields(uuid, text, text, date, text) to authenticated;
