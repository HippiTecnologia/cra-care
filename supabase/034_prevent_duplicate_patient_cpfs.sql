-- Impede duplicidade por CPF mesmo quando registros antigos usam pontuação.
-- Registros duplicados existentes são preservados para correção manual segura.

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

  if length(normalized_cpf) = 11 then
    -- Serializa tentativas concorrentes para o mesmo CPF dentro da clínica.
    perform pg_advisory_xact_lock(hashtextextended(new.clinic_id::text || ':' || normalized_cpf, 0));

    -- Permite editar outros dados de um registro duplicado legado sem obrigar
    -- a mesclar ou excluir prontuários durante esta migração.
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

drop trigger if exists patients_prevent_duplicate_normalized_cpf on public.patients;
create trigger patients_prevent_duplicate_normalized_cpf
before insert or update of cpf, clinic_id on public.patients
for each row
execute function public.prevent_duplicate_patient_normalized_cpf();

