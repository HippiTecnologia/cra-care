create policy "secretaria e adm leem perfis da clinica" on public.profiles
for select to authenticated using (
  clinic_id = public.current_clinic_id()
  and exists (select 1 from public.profiles actor where actor.id = auth.uid() and actor.role in ('super_admin', 'admin', 'secretaria'))
);
