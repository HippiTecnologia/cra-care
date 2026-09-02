-- Execute depois de schema.sql, no Supabase SQL Editor.
-- Credenciais são criadas pelo servidor e armazenadas pelo Supabase somente em formato hash.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists must_change_password boolean not null default true;
alter table public.patients add column if not exists username text;
alter table public.patients add column if not exists must_change_password boolean not null default false;

create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username)) where username is not null;
create unique index if not exists patients_username_unique_idx on public.patients (lower(username)) where username is not null;

comment on column public.profiles.username is 'Login exibido ao usuário. O Supabase continua guardando a senha em hash.';
comment on column public.profiles.must_change_password is 'Somente Secretaria e ADM trocam a senha no primeiro acesso.';
comment on column public.patients.username is 'Login criado pela secretaria para acesso do paciente.';
comment on column public.patients.must_change_password is 'Paciente pode manter a senha inicial baseada na data de nascimento.';
