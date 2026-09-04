-- Correções cadastrais solicitadas para a operação real.
-- O username identifica somente o acesso administrativo, sem alterar a médica Patricia Martinski.

update public.profiles
set full_name = 'Patricia Trudes',
    updated_at = now()
where username = 'adm.centroderinite'
  and role in ('admin', 'super_admin');
