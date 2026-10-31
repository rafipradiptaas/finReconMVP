-- Demo data for local development and the MVP demo.
--
-- HOW TO USE
--
-- 1. Run supabase/migrations/0001_init.sql, then 0002_v3.sql, in the Supabase
--    SQL Editor first.
--    This file is also run in the SQL Editor and is safe to re-run.
--
-- 2. Create three users by hand: Supabase Dashboard -> Authentication ->
--    Users -> Add user (email + password, "Auto Confirm User" on).
--
--        admin@democorp.test
--        ap_staff@democorp.test
--        approver@democorp.test
--
--    Auth users cannot be created from SQL on a hosted project; the Auth API
--    owns that table.
--
-- 3. Run the "link profiles" block below. It looks the users up by email, so
--    there are no UUIDs to copy by hand.
--
-- Self-registration (app/(auth)/register) only creates the auth user. Linking
-- it to an organization is an admin action, which for the MVP means this file.

-- organizations.name is not unique, so ON CONFLICT would never fire; guard
-- explicitly so re-running this file never creates a second Demo Corp.
insert into public.organizations (name)
select 'Demo Corp'
where not exists (select 1 from public.organizations where name = 'Demo Corp');

-- ------------------------------------------------------- link profiles (step 3)

insert into public.profiles (id, organization_id, role, full_name)
select u.id, o.id, 'admin', 'Admin Demo'
from auth.users u, public.organizations o
where u.email = 'admin@democorp.test' and o.name = 'Demo Corp'
on conflict (id) do nothing;

insert into public.profiles (id, organization_id, role, full_name)
select u.id, o.id, 'ap_staff', 'Staf AP Demo'
from auth.users u, public.organizations o
where u.email = 'ap_staff@democorp.test' and o.name = 'Demo Corp'
on conflict (id) do nothing;

insert into public.profiles (id, organization_id, role, full_name)
select u.id, o.id, 'approver', 'Approver Demo'
from auth.users u, public.organizations o
where u.email = 'approver@democorp.test' and o.name = 'Demo Corp'
on conflict (id) do nothing;

-- ------------------------------------------------ second organization (optional)
--
-- For demo scenario 10 (product doc section 18): log in as another
-- organization and see nothing from Demo Corp. tests/rls.integration.test.ts
-- creates and removes its own throwaway organization, so this block is only
-- needed if you want to click through it by hand.
--
-- Create other@othercorp.test in the Dashboard first, then:
--
--   insert into public.organizations (name)
--   select 'Other Corp'
--   where not exists (select 1 from public.organizations where name = 'Other Corp');
--
--   insert into public.profiles (id, organization_id, role, full_name)
--   select u.id, o.id, 'admin', 'Admin Other'
--   from auth.users u, public.organizations o
--   where u.email = 'other@othercorp.test' and o.name = 'Other Corp'
--   on conflict (id) do nothing;
