-- As duas enfermeiras da clínica podem corrigir laudos Prick e Patch,
-- inclusive quando o registro foi iniciado pela outra profissional.
drop policy if exists "enfermagem atualiza laudos da clinica" on public.nursing_reports;
create policy "enfermagem atualiza laudos da clinica" on public.nursing_reports
for update to authenticated
using (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'enfermagem'
)
with check (
  clinic_id = public.current_clinic_id()
  and public.current_app_role() = 'enfermagem'
);
