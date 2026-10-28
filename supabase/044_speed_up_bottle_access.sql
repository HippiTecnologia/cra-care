-- Resolve session-wide identity once per query instead of once per bottle row.
-- The access rules and allowed roles stay the same.
alter policy "equipe acessa frascos" on public.bottles
  using (
    clinic_id = (select public.current_clinic_id())
    and (select public.current_app_role()) = any (
      array['super_admin'::public.app_role, 'admin'::public.app_role,
            'secretaria'::public.app_role, 'medico'::public.app_role,
            'laboratorio'::public.app_role]
    )
  )
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.current_app_role()) = any (
      array['super_admin'::public.app_role, 'admin'::public.app_role,
            'secretaria'::public.app_role, 'medico'::public.app_role,
            'laboratorio'::public.app_role]
    )
  );

alter policy "paciente acessa frascos" on public.bottles
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = bottles.patient_id
        and patient.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.patients patient
      where patient.id = bottles.patient_id
        and patient.auth_user_id = (select auth.uid())
    )
  );
