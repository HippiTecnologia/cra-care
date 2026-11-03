-- Extensoes usadas pelo agendador de notificacoes ao paciente.
-- pg_cron dispara a cada minuto; pg_net chama o endpoint protegido da aplicacao.

create extension if not exists pg_cron;
create extension if not exists pg_net;

notify pgrst, 'reload schema';
