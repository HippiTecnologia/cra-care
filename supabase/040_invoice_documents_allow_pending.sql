-- Permite armazenar notas fiscais cujo CPF não foi identificado no PDF.
-- O documento fica sob gestão da Secretaria até ser vinculado manualmente.
alter table public.invoice_documents
  alter column patient_id drop not null;

notify pgrst, 'reload schema';
