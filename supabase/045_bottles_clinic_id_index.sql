-- Supports the stable, paginated clinic bottle query used by secretary screens.
create index if not exists bottles_clinic_id_id_idx
  on public.bottles (clinic_id, id);
