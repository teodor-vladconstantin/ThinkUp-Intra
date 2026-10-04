-- RLS check for four test personas (PRD section 11, phase 1) plus an inactive user.
--
-- Run with:  bun run rls:check   (scripts/rls-check.ts wraps this file in a transaction
-- and ALWAYS rolls it back, so no fixture row survives).
-- Do not run this file on its own outside a transaction: it relies on "set local".
--
-- How impersonation works: Supabase's auth.jwt() reads the request.jwt.claims setting.
-- We set it to a fake Clerk token ({"sub": "<clerk id>"}), switch to the
-- "authenticated" role (which is subject to RLS), and run the query. Fixtures are
-- inserted before that as the table owner, which bypasses RLS.

-- ---------------------------------------------------------------------
-- Result table + two tiny helpers
-- ---------------------------------------------------------------------
create temp table rls_results (
  id serial,
  persona text,
  check_name text,
  expected text,
  actual text
);
grant all on rls_results to public;
grant usage on sequence rls_results_id_seq to public;

-- Count rows the current role can see.
create function pg_temp.cnt(q text) returns text language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  return n::text;
end $$;

-- Try a write. 'ok' if at least one row was written, 'denied' if RLS rejected it
-- (insert raises an error; update/delete silently match 0 rows).
create function pg_temp.try(q text) returns text language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return case when n > 0 then 'ok' else 'denied' end;
exception when others then
  return 'denied';
end $$;

-- ---------------------------------------------------------------------
-- Fixtures (as table owner, RLS bypassed)
-- ---------------------------------------------------------------------
insert into profiles (clerk_id, email, full_name, role, department_id, is_active) values
  ('rls_mentor_tech', 'rls.mentor.tech@think-up.academy', 'RLS Mentor Tech', 'mentor', (select id from departments where name = 'Tech'), true),
  ('rls_vp_tech',     'rls.vp.tech@think-up.academy',     'RLS VP Tech',     'vp',     (select id from departments where name = 'Tech'), true),
  ('rls_vp_pn',       'rls.vp.pn@think-up.academy',       'RLS VP PN',       'vp',     (select id from departments where name = 'PN'),   true),
  ('rls_secretary',   'rls.secretary@think-up.academy',   'RLS Secretary',   'secretary', null, true),
  ('rls_inactive',    'rls.inactive@think-up.academy',    'RLS Inactive',    'mentor', (select id from departments where name = 'MK'),   false);

insert into tasks (id, title, creator_id, assignee_id, department_id, requesting_department_id) values
  ('00000000-0000-0000-0000-000000000001', 'RLS tech task',        'rls_vp_tech',   'rls_mentor_tech', (select id from departments where name = 'Tech'), null),
  ('00000000-0000-0000-0000-000000000002', 'RLS pn task',          'rls_vp_pn',     null,              (select id from departments where name = 'PN'),   null),
  ('00000000-0000-0000-0000-000000000003', 'RLS pn task for tech', 'rls_vp_tech',   null,              (select id from departments where name = 'PN'),   (select id from departments where name = 'Tech')),
  ('00000000-0000-0000-0000-000000000004', 'RLS mk task inactive', 'rls_secretary', 'rls_inactive',    (select id from departments where name = 'MK'),   null);

insert into meetings (kind, department_id, title, held_at) values
  ('cd',         null,                                           'RLS cd meeting',   now()),
  ('department', (select id from departments where name = 'Tech'), 'RLS tech meeting', now()),
  ('department', (select id from departments where name = 'PN'),   'RLS pn meeting',   now());

insert into schools (id, name, county_code) values (900001, 'RLS school', 'CJ');
insert into ambassadors (id, full_name, school_id) values (900001, 'RLS ambassador', 900001);
insert into ambassador_contacts (ambassador_id, email, phone) values (900001, 'amb@example.com', '0700000000');

-- Shorthands used below (dollar-quoted so the inner SQL needs no escaping).
-- Visible-row queries filter on the 'RLS ' prefix, so rows inserted by write checks
-- (prefixed 'W ') never change the counts.

-- =====================================================================
-- Persona 1: Tech mentor
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"rls_mentor_tech","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'tasks: read (own dept + requested by Tech)', '2', pg_temp.cnt($q$select 1 from tasks where title like 'RLS %'$q$)),
  ('mentor_tech', 'meetings: read (Tech dept only)',            '1', pg_temp.cnt($q$select 1 from meetings where title like 'RLS %'$q$)),
  ('mentor_tech', 'schools: read',                              '0', pg_temp.cnt($q$select 1 from schools where name like 'RLS %'$q$)),
  ('mentor_tech', 'ambassador_contacts: read',                  '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'tasks: create in own dept', 'ok', pg_temp.try($q$insert into tasks (title, creator_id, department_id) values ('W mentor own', 'rls_mentor_tech', (select id from departments where name = 'Tech'))$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'tasks: create in PN', 'denied', pg_temp.try($q$insert into tasks (title, creator_id, department_id) values ('W mentor pn', 'rls_mentor_tech', (select id from departments where name = 'PN'))$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'tasks: update assigned task', 'ok', pg_temp.try($q$update tasks set status = 'in_progress' where id = '00000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'tasks: update PN task', 'denied', pg_temp.try($q$update tasks set status = 'done' where id = '00000000-0000-0000-0000-000000000002'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'meetings: create Tech meeting', 'denied', pg_temp.try($q$insert into meetings (kind, department_id, title, held_at, author_id) values ('department', (select id from departments where name = 'Tech'), 'W m', now(), 'rls_mentor_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'invitations: create', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('w1@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'rls_mentor_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'profiles: insert from client', 'denied', pg_temp.try($q$insert into profiles (clerk_id, email, role, department_id) values ('w_x', 'wx@think-up.academy', 'vp', 1)$q$));
reset role;

-- =====================================================================
-- Persona 2: VP Tech (CD member, no PN access)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"rls_vp_tech","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'tasks: read (CD sees all)',        '4', pg_temp.cnt($q$select 1 from tasks where title like 'RLS %'$q$)),
  ('vp_tech', 'meetings: read (CD + Tech)',       '2', pg_temp.cnt($q$select 1 from meetings where title like 'RLS %'$q$)),
  ('vp_tech', 'schools: read',                    '0', pg_temp.cnt($q$select 1 from schools where name like 'RLS %'$q$)),
  ('vp_tech', 'ambassador_contacts: read',        '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'tasks: create for PN (cross-dept)', 'ok', pg_temp.try($q$insert into tasks (title, creator_id, department_id, requesting_department_id) values ('W vp cross', 'rls_vp_tech', (select id from departments where name = 'PN'), (select id from departments where name = 'Tech'))$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'meetings: create Tech meeting', 'ok', pg_temp.try($q$insert into meetings (kind, department_id, title, held_at, author_id) values ('department', (select id from departments where name = 'Tech'), 'W m', now(), 'rls_vp_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'meetings: create PN meeting', 'denied', pg_temp.try($q$insert into meetings (kind, department_id, title, held_at, author_id) values ('department', (select id from departments where name = 'PN'), 'W m', now(), 'rls_vp_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'meetings: create CD meeting', 'denied', pg_temp.try($q$insert into meetings (kind, title, held_at, author_id) values ('cd', 'W m', now(), 'rls_vp_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'invitations: mentor into Tech', 'ok', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('w2@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'rls_vp_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'invitations: mentor into PN', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('w3@think-up.academy', 'mentor', (select id from departments where name = 'PN'), 'rls_vp_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'invitations: a VP into Tech', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('w4@think-up.academy', 'vp', (select id from departments where name = 'Tech'), 'rls_vp_tech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'invitations: spoofed invited_by (fix 3)', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('w5@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'rls_vp_pn')$q$));
reset role;

-- =====================================================================
-- Persona 3: VP PN
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"rls_vp_pn","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'tasks: read (CD sees all)',   '4', pg_temp.cnt($q$select 1 from tasks where title like 'RLS %'$q$)),
  ('vp_pn', 'meetings: read (CD + PN)',    '2', pg_temp.cnt($q$select 1 from meetings where title like 'RLS %'$q$)),
  ('vp_pn', 'schools: read',               '1', pg_temp.cnt($q$select 1 from schools where name like 'RLS %'$q$)),
  ('vp_pn', 'ambassador_contacts: read',   '1', pg_temp.cnt($q$select 1 from ambassador_contacts$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'schools: create', 'ok', pg_temp.try($q$insert into schools (name, county_code) values ('W school', 'CJ')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'ambassador_contacts: update', 'ok', pg_temp.try($q$update ambassador_contacts set phone = '0711111111' where ambassador_id = 900001$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'meetings: create PN meeting', 'ok', pg_temp.try($q$insert into meetings (kind, department_id, title, held_at, author_id) values ('department', (select id from departments where name = 'PN'), 'W m', now(), 'rls_vp_pn')$q$));
reset role;

-- =====================================================================
-- Persona 4: Secretary (CD, sees PN map but not ambassador contacts)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"rls_secretary","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'tasks: read (CD sees all)',           '4', pg_temp.cnt($q$select 1 from tasks where title like 'RLS %'$q$)),
  ('secretary', 'meetings: read (CD only)',            '1', pg_temp.cnt($q$select 1 from meetings where title like 'RLS %'$q$)),
  ('secretary', 'schools: read',                       '1', pg_temp.cnt($q$select 1 from schools where name like 'RLS %'$q$)),
  ('secretary', 'ambassador_contacts: read',           '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'meetings: create CD meeting', 'ok', pg_temp.try($q$insert into meetings (kind, title, held_at, author_id) values ('cd', 'W m', now(), 'rls_secretary')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'schools: create', 'denied', pg_temp.try($q$insert into schools (name, county_code) values ('W school', 'CJ')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'tasks: update Tech task (not creator/assignee)', 'denied', pg_temp.try($q$update tasks set status = 'done' where id = '00000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'invitations: create (any staff role)', 'ok', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('w6@think-up.academy', 'ceo', 'rls_secretary')$q$));
reset role;

-- =====================================================================
-- Extra: deactivated user (fix 1). Assigned to task 4, must see and change nothing.
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"rls_inactive","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('inactive', 'tasks: read own assigned task', '0', pg_temp.cnt($q$select 1 from tasks where title like 'RLS %'$q$)),
  ('inactive', 'profiles: read',                '0', pg_temp.cnt($q$select 1 from profiles$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('inactive', 'tasks: update own assigned task', 'denied', pg_temp.try($q$update tasks set status = 'done' where id = '00000000-0000-0000-0000-000000000004'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('inactive', 'task_comments: comment on own task', 'denied', pg_temp.try($q$insert into task_comments (task_id, author_id, body) values ('00000000-0000-0000-0000-000000000004', 'rls_inactive', 'W')$q$));
reset role;

-- =====================================================================
-- Extra: Tech gets PN view access (fix 2). Map yes, contacts and writes no.
-- =====================================================================
update departments set can_access_pn = true where name = 'Tech';
select set_config('request.jwt.claims', '{"sub":"rls_mentor_tech","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech+pn_flag', 'schools: read',             '1', pg_temp.cnt($q$select 1 from schools where name like 'RLS %'$q$)),
  ('mentor_tech+pn_flag', 'ambassador_contacts: read', '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech+pn_flag', 'schools: create', 'denied', pg_temp.try($q$insert into schools (name, county_code) values ('W school', 'CJ')$q$));
reset role;

-- invitations constraint (fix 3): a mentor invitation without department is rejected
-- even for the table owner.
insert into rls_results (persona, check_name, expected, actual) values
  ('owner', 'invitations: mentor without department', 'denied', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('w7@think-up.academy', 'mentor', 'rls_vp_tech')$q$));
