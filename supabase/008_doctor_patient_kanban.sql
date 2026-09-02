-- Pacientes pré-cadastrados pelo médico entram diretamente em "Paciente com pedido".
-- Preserva pacientes cujo cadastro já foi concluído e movimentado pela Secretaria.

update public.patients
set
  status = 'com-pedido',
  updated_at = now()
where doctor_profile_id is not null
  and status = 'em-conversa'
  and auth_user_id is null
  and coalesce(username, '') = '';
