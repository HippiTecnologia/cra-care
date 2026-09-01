-- Permite que a chave privada do servidor gerencie os dados do CRA Care.
-- Execute uma única vez no SQL Editor do Supabase.
-- Essa permissão não é exposta ao navegador; ela é usada somente pelo backend.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
