-- Amplia os provedores de assinatura sem registrar senha, token ou chave privada.
-- Execute depois da migration 026.
alter table public.prescription_digital_signatures
  drop constraint if exists prescription_digital_signatures_provider_check;

alter table public.prescription_digital_signatures
  add constraint prescription_digital_signatures_provider_check
  check (provider in ('vidaas', 'soluti', 'a1', 'a3', 'cloud', 'demo'));
