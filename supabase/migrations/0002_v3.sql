-- FinRecon AI - v3 schema. Run once, after 0001_init.sql.
-- Tables: product doc section 14. Enums: section 8. Access model: decision D21.
--
-- anon and authenticated are READ-ONLY. Every write goes through a server API
-- route using the service role (lib/server/write-context.ts), so the role, SoD
-- and audit checks cannot be skipped by calling PostgREST with the public key.

-- -------------------------------------------------------------------- enums

-- Stored inside extractions.fields (jsonb), like field_confidence in 0001.
create type public.field_verification as enum ('verified', 'unverified', 'manual');

create type public.followup_status as enum ('DRAFT', 'SENT', 'DISCARDED');

create type public.llm_purpose as enum (
  'extract_invoice', 'extract_invoice_vision', 'explain_match',
  'agent_followup', 'agent_reply', 'chatbot'
);

-- ---------------------------------------------------------- existing tables

alter table public.profiles
  add column deactivated_at timestamptz;

alter table public.vendors
  add column contact_email text;

alter table public.documents
  add column status_message text;

alter table public.invoices
  add column subtotal                  numeric(18, 2),
  add column tax_amount                numeric(18, 2),
  add column vendor_name               text,
  add column po_number                 text,
  add column invoice_number_normalized text,
  add column imported_history          boolean not null default false;

alter table public.extractions
  add column text_items     jsonb,
  add column prompt_version text,
  add column checks_version text;

create index on public.invoices (organization_id, vendor_id, invoice_number_normalized);

-- --------------------------------------------------------------- new tables

create table public.investigation_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  match_id        uuid not null references public.matches (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete restrict,
  note            text not null,
  created_at      timestamptz not null default now()
);

create table public.review_sessions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete restrict,
  match_id               uuid not null references public.matches (id) on delete cascade,
  reviewer_id            uuid not null references public.profiles (id) on delete restrict,
  opened_at              timestamptz not null default now(),
  decided_at             timestamptz,
  decision               public.review_status
    check (decision in ('APPROVED', 'REJECTED_BY_REVIEWER')),
  items_ticked           jsonb not null default '[]',
  reason                 text,
  fields_corrected_count integer not null default 0
);

create table public.followups (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  match_id            uuid not null references public.matches (id) on delete cascade,
  status              public.followup_status not null default 'DRAFT',
  recipient           text,
  subject             text not null,
  body                text not null,
  ai_generated_body   text not null,
  edited              boolean not null default false,
  created_by          uuid not null references public.profiles (id) on delete restrict,
  sent_by             uuid references public.profiles (id) on delete restrict,
  sent_at             timestamptz,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.followup_replies (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  followup_id        uuid not null references public.followups (id) on delete cascade,
  pasted_by          uuid not null references public.profiles (id) on delete restrict,
  body               text not null,
  proposed_po_number text,
  proposed_po_valid  boolean,
  fraud_flag         boolean not null default false,
  fraud_reasons      jsonb not null default '[]',
  created_at         timestamptz not null default now()
);

create table public.llm_calls (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  purpose           public.llm_purpose not null,
  model             text not null,
  prompt_version    text not null,
  -- Null when the call failed before the provider reported usage.
  input_tokens      integer,
  output_tokens     integer,
  cost_estimate_usd numeric(12, 6),
  latency_ms        integer,
  ok                boolean not null,
  error_code        text,
  entity_type       text,
  entity_id         uuid,
  created_at        timestamptz not null default now()
);

create index on public.investigation_notes (organization_id);
create index on public.investigation_notes (match_id);
create index on public.review_sessions (organization_id);
create index on public.review_sessions (match_id);
create index on public.followups (organization_id);
create index on public.followups (match_id);
create index on public.followup_replies (organization_id);
create index on public.followup_replies (followup_id);
create index on public.llm_calls (organization_id, created_at desc);

-- ------------------------------------------------- read-only access (D21)

alter table public.investigation_notes enable row level security;
alter table public.review_sessions     enable row level security;
alter table public.followups           enable row level security;
alter table public.followup_replies    enable row level security;
alter table public.llm_calls           enable row level security;

-- Includes TRUNCATE, which Supabase's default privileges grant and 0001 never
-- took back.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- Tables created by later migrations start read-only too.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

grant select on table
  public.investigation_notes, public.review_sessions, public.followups,
  public.followup_replies, public.llm_calls
  to authenticated;

-- The 0001 "for all" policies would be dead code without the grants, and a
-- later grant would silently bring the writes back. Replace them with SELECT.
drop policy "own organization" on public.organizations;
create policy "read own organization" on public.organizations
  for select to authenticated
  using (id = (select public.current_org_id()));

drop policy "same organization" on public.profiles;
create policy "read own organization" on public.profiles
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.vendors;
create policy "read own organization" on public.vendors
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.purchase_orders;
create policy "read own organization" on public.purchase_orders
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.purchase_order_lines;
create policy "read own organization" on public.purchase_order_lines
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.documents;
create policy "read own organization" on public.documents
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.extractions;
create policy "read own organization" on public.extractions
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.invoices;
create policy "read own organization" on public.invoices
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "same organization" on public.matches;
create policy "read own organization" on public.matches
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy "insert own organization" on public.audit_logs;

create policy "read own organization" on public.investigation_notes
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy "read own organization" on public.review_sessions
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy "read own organization" on public.followups
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy "read own organization" on public.followup_replies
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy "read own organization" on public.llm_calls
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- A deactivated user keeps a valid JWT until it expires, so the cut-off lives
-- here: no organization means every policy above returns nothing, and
-- getSessionContext() finds no profile.
create or replace function public.current_org_id() returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select organization_id
    from public.profiles
   where id = (select auth.uid())
     and deactivated_at is null;
$$;

-- --------------------------------------------------- audit_logs append-only

-- ON DELETE SET NULL ran an UPDATE on audit_logs, which the trigger refuses, so
-- it could never work. Users are deactivated, not deleted (D21).
alter table public.audit_logs
  drop constraint audit_logs_actor_user_id_fkey,
  add constraint audit_logs_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users (id) on delete restrict;

-- Row-level and statement-level UPDATE/DELETE triggers do not fire on TRUNCATE.
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_is_append_only();
