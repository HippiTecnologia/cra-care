-- Permite que o médico responsável pelo paciente visualize todos os laudos
-- vinculados a ele, inclusive os que foram criados antes do vínculo médico.
drop policy if exists "medico acessa laudos dos seus pacientes" on public.nursing_reports;
create policy "medico acessa laudos dos seus pacientes" on public.nursing_reports
for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'medico'
  and exists (
    select 1 from public.patients
    where patients.id = nursing_reports.patient_id
      and patients.doctor_profile_id = auth.uid()
  )
);
