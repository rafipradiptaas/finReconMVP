-- FinRecon AI - decision D22. Run once, after 0002_v3.sql.

-- Imported history has no uploaded document. Every other invoice still needs one.
alter table public.invoices
  alter column document_id drop not null,
  add constraint invoices_document_required
    check (document_id is not null or imported_history = true);

-- RLS policies only run for authenticated, so anon never needs this function.
revoke execute on function public.current_org_id() from anon;
