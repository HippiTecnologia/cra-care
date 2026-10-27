create index if not exists bottles_clinic_bottle_number_idx
  on public.bottles (clinic_id, bottle_number desc, id asc);

create index if not exists bottles_clinic_received_at_idx
  on public.bottles (clinic_id, received_at desc, id asc);

create index if not exists patient_use_records_clinic_use_date_idx
  on public.patient_use_records (clinic_id, use_date desc, id asc);

create index if not exists patient_assessments_clinic_created_at_idx
  on public.patient_assessments (clinic_id, created_at desc, id asc);
