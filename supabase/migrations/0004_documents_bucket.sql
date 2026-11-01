-- FinRecon AI - private bucket for invoice PDFs. Run once, after 0003_d22.sql.
-- Path: {organization_id}/{document_id}.pdf. Files are never deleted.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Read-only, like every table (D21): a signed URL for the PDF viewer needs
-- SELECT, and the folder name keeps it inside the caller's organization.
-- Uploads go through the server route with the service role.
create policy "read own organization documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
  );
