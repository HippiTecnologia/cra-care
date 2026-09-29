-- A Enfermagem precisa localizar os médicos responsáveis pelos laudos.
-- O acesso é limitado aos perfis médicos da mesma clínica.
drop policy if exists "enfermagem le medicos responsaveis" on public.profiles;
create policy "enfermagem le medicos responsaveis" on public.profiles
for select to authenticated
using (
  clinic_id = public.current_clinic_id()
  and role = 'medico'
  and public.current_app_role() = 'enfermagem'
);
