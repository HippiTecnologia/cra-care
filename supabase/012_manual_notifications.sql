-- Notificações enviadas manualmente pela Secretaria para o portal do paciente.
-- Os avisos ficam no mesmo registro das preferências do portal para preservar
-- o histórico e permitir que o paciente marque cada aviso como lido.

alter table public.patient_portal_settings
  add column if not exists manual_notifications jsonb not null default '[]'::jsonb;
