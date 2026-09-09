-- Execute esta consulta sozinha e aguarde a confirmação do Supabase.
-- O PostgreSQL exige confirmar o novo valor do enum antes de usá-lo em políticas.
alter type public.app_role add value if not exists 'enfermagem';
