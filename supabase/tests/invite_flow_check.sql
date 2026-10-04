-- Invitation + first-sign-in flow, checked at database level.
-- Run with: bun run rls:check supabase/tests/invite_flow_check.sql
-- Same rules as rls_check.sql: wrapped in a transaction and always rolled back.
--
-- The "first sign-in" part replays, in SQL, the exact queries getCurrentProfile()
-- (src/lib/auth.ts) sends through the secret-key client (= table owner, no RLS).

create temp table rls_results (id serial, persona text, check_name text, expected text, actual text);
grant all on rls_results to public;
grant usage on sequence rls_results_id_seq to public;

create function pg_temp.cnt(q text) returns text language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') s' into n; return n::text; end $$;

create function pg_temp.try(q text) returns text language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count;
  return case when n > 0 then 'ok' else 'denied' end;
exception when others then return 'denied';
end $$;

create function pg_temp.val(q text) returns text language plpgsql as $$
declare v text;
begin execute q into v; return coalesce(v, 'null'); end $$;

-- Fixture: a superadmin who sends the invitations.
insert into profiles (clerk_id, email, full_name, role, department_id, is_superadmin) values
  ('flow_super', 'flow.super@think-up.academy', 'Flow Super', 'vp', (select id from departments where name = 'Tech'), true);

-- =====================================================================
-- 1. Sending invitations (as the superadmin, through RLS)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"flow_super","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'invite mentor into Tech', 'ok', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('mentor_test@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'flow_super')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'duplicate pending invite, other letter case', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('Mentor_Test@THINK-UP.academy', 'mentor', (select id from departments where name = 'Tech'), 'flow_super')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'invite CEO without department', 'ok', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('ceo.test@think-up.academy', 'ceo', 'flow_super')$q$));
-- Decoy: differs only where the "_" is. An unescaped ilike would match it too.
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'invite decoy mentorXtest', 'ok', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('mentorxtest@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'flow_super')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'sees own invitations', '3', pg_temp.cnt($q$select 1 from invitations$q$));
reset role;

-- =====================================================================
-- 2. First sign-in of mentor_test (as table owner = secret-key client)
-- =====================================================================
insert into rls_results (persona, check_name, expected, actual) values
  ('first sign-in', 'escaped ilike finds exactly one pending invite', '1',
   pg_temp.cnt($q$select 1 from invitations where email ilike 'mentor\_test@think-up.academy' and status = 'pending'$q$)),
  ('first sign-in', 'unescaped ilike would also match the decoy', '2',
   pg_temp.cnt($q$select 1 from invitations where email ilike 'mentor_test@think-up.academy' and status = 'pending'$q$));

-- Two parallel first loads: both insert, the second is ignored (on conflict do nothing).
insert into profiles (clerk_id, email, full_name, role, department_id)
select 'flow_mentor', 'mentor_test@think-up.academy', 'Flow Mentor', role, department_id
from invitations where email ilike 'mentor\_test@think-up.academy' and status = 'pending'
on conflict (clerk_id) do nothing;
insert into rls_results (persona, check_name, expected, actual) values
  ('first sign-in', 'second profile insert writes 0 rows', 'denied', pg_temp.try($q$insert into profiles (clerk_id, email, role, department_id) values ('flow_mentor', 'mentor_test@think-up.academy', 'mentor', 1) on conflict (clerk_id) do nothing$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('first sign-in', 'exactly one profile', '1', pg_temp.cnt($q$select 1 from profiles where clerk_id = 'flow_mentor'$q$)),
  ('first sign-in', 'profile got role from invitation', 'mentor', pg_temp.val($q$select role::text from profiles where clerk_id = 'flow_mentor'$q$)),
  ('first sign-in', 'profile got department from invitation', 'Tech', pg_temp.val($q$select d.name from profiles p join departments d on d.id = p.department_id where p.clerk_id = 'flow_mentor'$q$));

update invitations set status = 'accepted' where email ilike 'mentor\_test@think-up.academy' and status = 'pending';
insert into rls_results (persona, check_name, expected, actual) values
  ('first sign-in', 'invitation marked accepted', 'accepted', pg_temp.val($q$select status::text from invitations where email = 'mentor_test@think-up.academy'$q$)),
  ('first sign-in', 'decoy invitation untouched', 'pending', pg_temp.val($q$select status::text from invitations where email = 'mentorxtest@think-up.academy'$q$));

-- =====================================================================
-- 3. The new mentor, signed in
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"flow_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('new mentor', 'my_role()', 'mentor', pg_temp.val($q$select my_role()::text$q$)),
  ('new mentor', 'reads own profile', '1', pg_temp.cnt($q$select 1 from profiles where clerk_id = 'flow_mentor'$q$)),
  ('new mentor', 'cannot list invitations', '0', pg_temp.cnt($q$select 1 from invitations$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('new mentor', 'cannot change own role', 'denied', pg_temp.try($q$update profiles set role = 'ceo' where clerk_id = 'flow_mentor'$q$));
reset role;

-- =====================================================================
-- 4. Revoke and re-invite (as the superadmin)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"flow_super","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'revoke CEO invitation', 'ok', pg_temp.try($q$update invitations set status = 'revoked' where email = 'ceo.test@think-up.academy' and status = 'pending'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 're-invite after revoke', 'ok', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('ceo.test@think-up.academy', 'ceo', 'flow_super')$q$));
reset role;

-- =====================================================================
-- 5. Deactivation: access ends immediately
-- =====================================================================
update profiles set is_active = false where clerk_id = 'flow_mentor';
select set_config('request.jwt.claims', '{"sub":"flow_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('deactivated mentor', 'my_role() is null', 'null', pg_temp.val($q$select my_role()::text$q$)),
  ('deactivated mentor', 'reads no profiles', '0', pg_temp.cnt($q$select 1 from profiles$q$));
reset role;
