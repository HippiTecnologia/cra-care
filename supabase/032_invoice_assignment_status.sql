-- Estado da leitura automática de notas: vinculada, em análise ou pendente.
alter table public.invoice_documents
  add column if not exists assignment_status text not null default 'vinculada';

do $$ begin
  alter table public.invoice_documents add constraint invoice_documents_assignment_status_check
    check (assignment_status in ('vinculada', 'em_analise', 'pendente'));
exception when duplicate_object then null;
end $$;

create index if not exists invoice_documents_assignment_status_idx
  on public.invoice_documents(clinic_id, assignment_status, created_at desc);
