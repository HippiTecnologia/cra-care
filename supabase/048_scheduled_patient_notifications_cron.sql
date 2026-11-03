-- Execute depois de:
-- 1) habilitar pg_cron (Integrations > Cron) e pg_net (Database > Extensions);
-- 2) criar no Supabase Vault os segredos:
--      cra_care_app_url       = https://cra-care.vercel.app
--      cra_care_cron_secret   = o mesmo valor de CRON_SECRET configurado na Vercel.
-- Use a URL HTTPS de producao da Vercel, por exemplo https://cra-care.vercel.app.

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'cra_care_app_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'cra_care_cron_secret') then
    raise exception 'Crie cra_care_app_url e cra_care_cron_secret no Supabase Vault antes de agendar o cron.';
  end if;
end;
$$;

-- Torna o script repetivel sem duplicar jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'cra-care-dispatch-patient-notifications';

select cron.schedule(
  'cra-care-dispatch-patient-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'cra_care_app_url'), '/')
        || '/api/notifications/dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cra_care_cron_secret')
      ),
      body := jsonb_build_object('requested_at', now()),
      timeout_milliseconds := 55000
    );
  $$
);

-- A API usa esta verificacao para nao aceitar agendamentos antes de o cron
-- estar ativo e com o mesmo segredo configurado na Vercel.
create or replace function public.cra_care_scheduled_notifications_ready(p_expected_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(p_expected_secret, '') <> ''
    and exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
    and exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')
    and exists (
      select 1 from cron.job
      where jobname = 'cra-care-dispatch-patient-notifications'
        and schedule = '* * * * *'
    )
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'cra_care_cron_secret'
        and decrypted_secret = p_expected_secret
    )
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'cra_care_app_url'
        and decrypted_secret like 'https://%'
    );
$$;

revoke all on function public.cra_care_scheduled_notifications_ready(text) from public, anon, authenticated;
grant execute on function public.cra_care_scheduled_notifications_ready(text) to service_role;
