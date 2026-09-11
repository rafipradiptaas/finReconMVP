-- FinRecon AI - initial schema.
-- Tables: product doc section 11. Enums: section 8. Audit trail: section 10.
--
-- Every table carries organization_id and is protected by RLS scoped to the
-- caller's profiles.organization_id. Service-role callers bypass RLS and MUST
-- filter organization_id themselves (see lib/supabase/admin.ts).

-- ---------------------------------------------------------------- enums (8)

create type public.document_status as enum (
  'UPLOADED', 'EXTRACTING', 'EXTRACTED',
  'NEEDS_CORRECTION', 'EXTRACTION_FAILED', 'UNSUPPORTED_FORMAT'
);

create type public.match_status as enum (
  'REJECTED', 'FULL_MATCH', 'PARTIAL_MATCH', 'NO_MATCH'
);

create type public.veto_code as enum (
  'VETO_VENDOR_NOT_FOUND', 'VETO_VENDOR_NOT_VERIFIED',
  'VETO_BANK_MISMATCH', 'VETO_DUPLICATE_INVOICE'
);

create type public.review_status as enum (
  'PENDING_REVIEW', 'APPROVED', 'REJECTED_BY_REVIEWER', 'PAID'
);

create type public.vendor_status as enum ('verified', 'unverified', 'suspended');

create type public.user_role as enum ('admin', 'ap_staff', 'approver');

-- Not stored in a column of its own: per-field confidence lives inside
-- extractions.fields (jsonb) and is validated with Zod. Declared here so the
-- database and types/domain.ts agree on the allowed values.
create type public.field_confidence as enum ('high', 'medium', 'low', 'manual');

-- --------------------------------------------------------------- tables (11)

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  role            public.user_role not null,
  full_name       text,
  created_at      timestamptz not null default now()
);

create table public.vendors (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  vendor_code         text not null,
  vendor_name         text not null,
  npwp                text,
  bank_name           text,
  bank_account_number text,
  bank_account_holder text,
  status              public.vendor_status not null default 'unverified',
  last_verified_at    date,
  created_at          timestamptz not null default now(),
  unique (organization_id, vendor_code)
);

create table public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  po_number       text not null,
  vendor_id       uuid not null references public.vendors (id) on delete restrict,
  po_date         date not null,
  currency        text not null default 'IDR',
  -- Maintained by trigger from purchase_order_lines; never written by hand.
  -- A Postgres GENERATED column cannot aggregate a child table.
  total_amount    numeric(18, 2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, po_number)
);

create table public.purchase_order_lines (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  po_id            uuid not null references public.purchase_orders (id) on delete cascade,
  line_no          integer not null,
  item_description text not null,
  quantity         numeric(18, 4) not null,
  unit_price       numeric(18, 2) not null,
  unique (po_id, line_no)
);

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  storage_path      text not null,
  original_filename text not null,
  mime_type         text not null,
  status            public.document_status not null default 'UPLOADED',
  uploaded_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.extractions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id     uuid not null references public.documents (id) on delete cascade,
  raw_json        jsonb,
  fields          jsonb,
  model           text,
  created_at      timestamptz not null default now()
);

-- Values AFTER manual correction. This is what the matching engine reads.
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  document_id         uuid not null references public.documents (id) on delete cascade,
  vendor_id           uuid references public.vendors (id) on delete set null,
  po_id               uuid references public.purchase_orders (id) on delete set null,
  invoice_number      text,
  invoice_date        date,
  total_amount        numeric(18, 2),
  currency            text not null default 'IDR',
  bank_name           text,
  bank_account_number text,
  bank_account_holder text,
  npwp                text,
  line_items          jsonb,
  created_at          timestamptz not null default now(),
  unique (document_id)
);

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  invoice_id      uuid not null references public.invoices (id) on delete cascade,
  status          public.match_status not null,
  veto_code       public.veto_code,
  score           numeric(5, 2),
  score_breakdown jsonb,
  anomaly_flag    boolean not null default false,
  anomaly_reason  text,
  explanation     text,
  review_status   public.review_status not null default 'PENDING_REVIEW',
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  review_reason   text,
  paid_marked_by  uuid references public.profiles (id) on delete set null,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (invoice_id)
);

-- Append-only. See the revoke + trigger below; there is no UPDATE or DELETE
-- policy on purpose.
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_user_id   uuid references auth.users (id) on delete set null,
  actor_role      public.user_role,
  entity_type     text not null,
  entity_id       uuid,
  action          text not null,
  old_value       jsonb,
  new_value       jsonb,
  reason          text,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ indexes

create index on public.profiles (organization_id);
create index on public.vendors (organization_id);
create index on public.purchase_orders (organization_id);
create index on public.purchase_orders (vendor_id);
create index on public.purchase_order_lines (organization_id);
create index on public.purchase_order_lines (po_id);
create index on public.documents (organization_id, status);
create index on public.extractions (organization_id);
create index on public.extractions (document_id);
create index on public.invoices (organization_id);
create index on public.invoices (organization_id, invoice_number);
create index on public.invoices (vendor_id);
create index on public.matches (organization_id, review_status);
create index on public.matches (invoice_id);
create index on public.audit_logs (organization_id, created_at desc);
create index on public.audit_logs (entity_type, entity_id);

-- ----------------------------------------------------- purchase order totals

create function public.recalc_purchase_order_total() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- OLD and NEW are only assigned for some operations, and an UPDATE may move
  -- a line to another PO, so both parents are recalculated.
  if tg_op in ('DELETE', 'UPDATE') then
    update public.purchase_orders p
       set total_amount = coalesce(
             (select sum(l.quantity * l.unit_price)
                from public.purchase_order_lines l
               where l.po_id = old.po_id),
             0)
     where p.id = old.po_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    update public.purchase_orders p
       set total_amount = coalesce(
             (select sum(l.quantity * l.unit_price)
                from public.purchase_order_lines l
               where l.po_id = new.po_id),
             0)
     where p.id = new.po_id;
  end if;

  return null;
end;
$$;

create trigger purchase_order_lines_recalc_total
  after insert or update or delete on public.purchase_order_lines
  for each row execute function public.recalc_purchase_order_total();

-- ---------------------------------------------------------------------- RLS

-- SECURITY DEFINER so that the policy on profiles can read profiles without
-- recursing into its own policy.
create function public.current_org_id() returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select organization_id from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated;

alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.vendors              enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.documents            enable row level security;
alter table public.extractions          enable row level security;
alter table public.invoices             enable row level security;
alter table public.matches              enable row level security;
alter table public.audit_logs           enable row level security;

grant select, insert, update, delete on table
  public.organizations, public.profiles, public.vendors,
  public.purchase_orders, public.purchase_order_lines, public.documents,
  public.extractions, public.invoices, public.matches
  to authenticated;

-- An organization row is visible only to its own members.
create policy "own organization" on public.organizations
  for all to authenticated
  using (id = (select public.current_org_id()))
  with check (id = (select public.current_org_id()));

-- Same shape on every other table; role checks happen in API routes, not here.
create policy "same organization" on public.profiles
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.vendors
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.purchase_orders
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.purchase_order_lines
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.documents
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.extractions
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.invoices
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "same organization" on public.matches
  for all to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

-- --------------------------------------------------- audit_logs append-only

grant select, insert on table public.audit_logs to authenticated;
revoke update, delete on table public.audit_logs from authenticated, anon;

create policy "read own organization" on public.audit_logs
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy "insert own organization" on public.audit_logs
  for insert to authenticated
  with check (organization_id = (select public.current_org_id()));

-- The revoke stops authenticated and anon. The trigger also stops the
-- service role and the table owner, which bypass both RLS and grants.
create function public.audit_logs_is_append_only() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only: % is not allowed', tg_op;
end;
$$;

create trigger audit_logs_no_update
  before update on public.audit_logs
  for each statement execute function public.audit_logs_is_append_only();

create trigger audit_logs_no_delete
  before delete on public.audit_logs
  for each statement execute function public.audit_logs_is_append_only();
