-- Execute no Supabase SQL Editor antes de criar os acessos dos pacientes.
drop policy if exists "staff read patients" on public.patients;

create policy "staff or patient reads patient" on public.patients for select to authenticated using (
  auth.uid() = auth_user_id
  or (
    clinic_id = public.current_clinic_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin','admin','secretaria','medico','laboratorio')
    )
  )
);
