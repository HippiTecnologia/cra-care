-- Médicos podem localizar pacientes da própria clínica por nome/CPF,
-- sem que isso os coloque automaticamente na carteira de acompanhamento.
drop policy if exists "medico consulta pacientes da clinica" on public.patients;
create policy "medico consulta pacientes da clinica" on public.patients
for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'medico'
);

-- Todo laudo de enfermagem da clínica pode ser visualizado pelo médico
-- quando ele localizar o paciente. A autoria da enfermeira continua no registro.
drop policy if exists "medico consulta laudos da clinica" on public.nursing_reports;
create policy "medico consulta laudos da clinica" on public.nursing_reports
for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'medico'
);

-- A troca de responsável é feita por uma função restrita: o médico só pode
-- atribuir o acompanhamento a si mesmo, sem alterar os demais dados do paciente.
create or replace function public.assume_patient_care(target_patient_id uuid)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_patient public.patients;
begin
  if public.current_app_role() <> 'medico' then
    raise exception 'Somente médicos podem assumir acompanhamento.';
  end if;

  update public.patients
  set doctor_profile_id = auth.uid(), updated_at = now()
  where id = target_patient_id
    and clinic_id = public.current_clinic_id()
  returning * into updated_patient;

  if updated_patient.id is null then
    raise exception 'Paciente não encontrado nesta clínica.';
  end if;

  return updated_patient;
end;
$$;

revoke all on function public.assume_patient_care(uuid) from public;
grant execute on function public.assume_patient_care(uuid) to authenticated;

-- Registros profissionais informados para a equipe de Enfermagem.
update public.profiles
set crm = case lower(username)
  when 'enfermagem.diene' then '660924'
  when 'enfermagem.terezinha' then '665417'
  else crm
end
where role = 'enfermagem'
  and lower(username) in ('enfermagem.diene', 'enfermagem.terezinha');
