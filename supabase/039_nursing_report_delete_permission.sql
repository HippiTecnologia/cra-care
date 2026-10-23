-- Permite que a Enfermagem exclua laudos da própria clínica,
-- conforme a ação já disponível na tela. Médicos só excluem laudos
-- iniciados pelo próprio perfil; admins mantêm o acesso administrativo.
drop policy if exists "enfermagem exclui laudos da clinica" on public.nursing_reports;
create policy "enfermagem exclui laudos da clinica" on public.nursing_reports
for delete to authenticated
using (
  clinic_id = (select public.current_clinic_id())
  and (
    (select public.current_app_role()) = 'enfermagem'
    or (
      (select public.current_app_role()) = 'medico'
      and nurse_profile_id = (select auth.uid())
    )
    or (select public.current_app_role()) in ('admin', 'super_admin')
  )
);
