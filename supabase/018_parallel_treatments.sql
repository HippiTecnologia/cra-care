-- Permite registrar Rinite e Imunobacteriana no mesmo dia, cada uma ligada
-- ao seu próprio frasco. Mantém todos os registros já existentes.

alter table public.patient_use_records
  drop constraint if exists patient_use_records_patient_id_use_date_key;

create unique index if not exists patient_use_records_patient_bottle_date_key
  on public.patient_use_records (patient_id, bottle_id, use_date)
  where bottle_id is not null;

-- Registros antigos sem frasco continuam protegidos por dia do paciente.
create unique index if not exists patient_use_records_patient_date_without_bottle_key
  on public.patient_use_records (patient_id, use_date)
  where bottle_id is null;
