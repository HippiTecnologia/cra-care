-- Permite à Enfermagem localizar pacientes da própria clínica apenas para laudos.
drop policy if exists "enfermagem consulta pacientes da clinica" on public.patients;
create policy "enfermagem consulta pacientes da clinica" on public.patients
for select to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() = 'enfermagem');

drop policy if exists "enfermagem consulta laudos da clinica" on public.nursing_reports;
create policy "enfermagem consulta laudos da clinica" on public.nursing_reports
for select to authenticated
using (clinic_id = public.current_clinic_id() and public.current_app_role() = 'enfermagem');
