-- Etapa 2: fluxo real Médico -> Secretaria.
-- Mantém os dados existentes e restringe cada médico aos próprios pacientes e receitas.

update public.profiles
set must_change_password = false
where role in ('medico', 'laboratorio');

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.patients to authenticated;
grant select, insert, update on public.prescriptions to authenticated;
grant select on public.bottles, public.patient_assessments to authenticated;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

drop policy if exists "staff read patients" on public.patients;
drop policy if exists "staff manage patients" on public.patients;
drop policy if exists "equipe ou paciente le cadastro" on public.patients;
drop policy if exists "equipe autorizada gerencia pacientes" on public.patients;
drop policy if exists "perfis autorizados leem pacientes" on public.patients;
drop policy if exists "medico ou secretaria cria paciente" on public.patients;
drop policy if exists "medico ou secretaria atualiza paciente" on public.patients;

create policy "perfis autorizados leem pacientes"
on public.patients
for select
to authenticated
using (
  clinic_id = public.current_clinic_id()
  and (
    auth_user_id = auth.uid()
    or public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'laboratorio')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
  )
);

create policy "medico ou secretaria cria paciente"
on public.patients
for insert
to authenticated
with check (
  clinic_id = public.current_clinic_id()
  and (
    public.current_app_role() in ('super_admin', 'admin', 'secretaria')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
  )
);

create policy "medico ou secretaria atualiza paciente"
on public.patients
for update
to authenticated
using (
  clinic_id = public.current_clinic_id()
  and (
    public.current_app_role() in ('super_admin', 'admin', 'secretaria')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
  )
)
with check (
  clinic_id = public.current_clinic_id()
  and (
    public.current_app_role() in ('super_admin', 'admin', 'secretaria')
    or (public.current_app_role() = 'medico' and doctor_profile_id = auth.uid())
  )
);

drop policy if exists "clinic access prescriptions" on public.prescriptions;
drop policy if exists "perfis autorizados leem receitas" on public.prescriptions;
drop policy if exists "medico cria receita propria" on public.prescriptions;
drop policy if exists "medico atualiza receita propria" on public.prescriptions;

create policy "perfis autorizados leem receitas"
on public.prescriptions
for select
to authenticated
using (
  clinic_id = public.current_clinic_id()
  and (
    doctor_profile_id = auth.uid()
    or public.current_app_role() in ('super_admin', 'admin', 'secretaria', 'laboratorio')
    or exists (
      select 1
      from public.patients patient
      where patient.id = prescriptions.patient_id and patient.auth_user_id = auth.uid()
    )
  )
);

create policy "medico cria receita propria"
on public.prescriptions
for insert
to authenticated
with check (
  clinic_id = public.current_clinic_id()
  and doctor_profile_id = auth.uid()
  and public.current_app_role() = 'medico'
  and exists (
    select 1
    from public.patients patient
    where patient.id = prescriptions.patient_id and patient.doctor_profile_id = auth.uid()
  )
);

create policy "medico atualiza receita propria"
on public.prescriptions
for update
to authenticated
using (
  clinic_id = public.current_clinic_id()
  and doctor_profile_id = auth.uid()
  and public.current_app_role() = 'medico'
)
with check (
  clinic_id = public.current_clinic_id()
  and doctor_profile_id = auth.uid()
  and public.current_app_role() = 'medico'
);
