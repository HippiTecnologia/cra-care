-- Permite o volume fixo de 9 mL usado nas prescrições de Imunobacteriana.
-- Recria os limites para instalações que já aplicaram a migration 030.

alter table public.prescriptions
  drop constraint if exists prescriptions_bottle_volume_check;
alter table public.prescriptions
  add constraint prescriptions_bottle_volume_check
  check (bottle_volume_ml is null or bottle_volume_ml in (4, 6, 8, 9, 10, 12));

alter table public.batch_items
  drop constraint if exists batch_items_bottle_volume_check;
alter table public.batch_items
  add constraint batch_items_bottle_volume_check
  check (bottle_volume_ml is null or bottle_volume_ml in (4, 6, 8, 9, 10, 12));

alter table public.bottles
  drop constraint if exists bottles_volume_check;
alter table public.bottles
  add constraint bottles_volume_check
  check (volume_ml is null or volume_ml in (4, 6, 8, 9, 10, 12));
