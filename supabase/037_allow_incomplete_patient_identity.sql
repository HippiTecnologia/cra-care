-- Permite importar cadastros sem CPF ou data de nascimento para a Secretaria
-- completar depois. Campos ausentes são NULL, nunca valores fictícios.
alter table public.patients
  alter column cpf drop not null,
  alter column birth_date drop not null;

-- A unicidade por clínica continua valendo para CPFs informados. O trigger
-- transforma CPF vazio em NULL para permitir vários cadastros incompletos.
create or replace function public.prevent_duplicate_patient_normalized_cpf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_cpf text;
begin
  normalized_cpf := regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g');

  if normalized_cpf = '' then
    new.cpf := null;
    return new;
  end if;

  if length(normalized_cpf) = 11 then
    perform pg_advisory_xact_lock(hashtextextended(new.clinic_id::text || ':' || normalized_cpf, 0));

    if tg_op = 'UPDATE'
      and old.clinic_id = new.clinic_id
      and regexp_replace(coalesce(old.cpf, ''), '[^0-9]', '', 'g') = normalized_cpf then
      new.cpf := normalized_cpf;
      return new;
    end if;

    if exists (
      select 1
      from public.patients p
      where p.clinic_id = new.clinic_id
        and p.id <> new.id
        and regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') = normalized_cpf
    ) then
      raise exception 'CPF_DUPLICADO'
        using errcode = '23505', constraint = 'patients_clinic_normalized_cpf_key';
    end if;
  end if;

  new.cpf := normalized_cpf;
  return new;
end;
$$;

notify pgrst, 'reload schema';
