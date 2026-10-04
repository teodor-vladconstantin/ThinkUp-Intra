-- Platform step 1: students, ambassadors, and the wall between PN and Tech/MK.
-- Run with: bun run rls:check supabase/tests/platform_access_check.sql   (always rolled back)

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

-- ---------- fixtures (as table owner) ----------
insert into profiles (clerk_id, email, full_name, role, department_id) values
  ('x_ceo',     'x.ceo@think-up.academy',         'X CEO',            'ceo',     null),
  ('x_vptech',  'x.vptech@think-up.academy',      'X VP Tech',        'vp',      (select id from departments where name = 'Tech')),
  ('x_tech',    'x.tech@think-up.academy',        'X Mentor Tech',    'mentor',  (select id from departments where name = 'Tech')),
  ('x_techamb', 'x.techamb@mentor.think-up.academy', 'X Tech Ambasador', 'mentor', (select id from departments where name = 'Tech')),
  ('x_mk',      'x.mk@think-up.academy',          'X Mentor MK',      'mentor',  (select id from departments where name = 'MK')),
  ('x_pn',      'x.pn@think-up.academy',          'X Mentor PN',      'mentor',  (select id from departments where name = 'PN')),
  ('x_stud',    'x.stud@think-up.academy',        'X Elev',           'student', null),
  ('x_stud2',   'x.stud2@think-up.academy',       'X Elev Nelegat',   'student', null);

insert into schools (name, county_code) values ('X Liceu', 'CJ');
insert into ambassadors (full_name, school_id, profile_id) values
  ('X Elev',           (select id from schools where name = 'X Liceu'), 'x_stud'),
  ('X Tech Ambasador', (select id from schools where name = 'X Liceu'), 'x_techamb');
insert into ambassador_contacts (ambassador_id, phone)
  select id, '0700000000' from ambassadors where full_name = 'X Elev';

insert into announcements (title, author_id) values ('X anunt', 'x_ceo');
insert into documents (title, url, visibility, created_by) values ('X doc', 'https://drive.google.com/x', 'all', 'x_ceo');
insert into tasks (title, creator_id, department_id) values ('X task Tech', 'x_vptech', (select id from departments where name = 'Tech'));

-- ---------- constraints ----------
insert into rls_results (persona, check_name, expected, actual) values
  ('owner', 'student with a department rejected', 'denied', pg_temp.try($q$insert into profiles (clerk_id, email, role, department_id) values ('x_bad', 'x.bad@think-up.academy', 'student', 1)$q$));

-- =====================================================================
-- Student who is a linked ambassador: platform yes, intranet and PN no
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"x_stud","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('student', 'is_staff', 'false', pg_temp.val($q$select is_staff()::text$q$)),
  ('student', 'is_ambassador', 'true', pg_temp.val($q$select is_ambassador()::text$q$)),
  ('student', 'can_access_platform', 'true', pg_temp.val($q$select can_access_platform()::text$q$)),
  ('student', 'can_access_pn', 'false', pg_temp.val($q$select can_access_pn()::text$q$)),
  ('student', 'profiles: only own row', '1', pg_temp.cnt($q$select 1 from profiles$q$)),
  ('student', 'departments', '0', pg_temp.cnt($q$select 1 from departments$q$)),
  ('student', 'announcements', '0', pg_temp.cnt($q$select 1 from announcements$q$)),
  ('student', 'documents (visibility all)', '0', pg_temp.cnt($q$select 1 from documents$q$)),
  ('student', 'tasks', '0', pg_temp.cnt($q$select 1 from tasks$q$)),
  ('student', 'meetings', '0', pg_temp.cnt($q$select 1 from meetings$q$)),
  ('student', 'ambassadors (PN)', '0', pg_temp.cnt($q$select 1 from ambassadors$q$)),
  ('student', 'ambassador_contacts (PN)', '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$)),
  ('student', 'schools (PN)', '0', pg_temp.cnt($q$select 1 from schools$q$)),
  ('student', 'counties (PN)', '0', pg_temp.cnt($q$select 1 from counties$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student', 'create task', 'denied', pg_temp.try($q$insert into tasks (title, creator_id) values ('X s', 'x_stud')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student', 'post announcement', 'denied', pg_temp.try($q$insert into announcements (title, author_id) values ('X s', 'x_stud')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student', 'invite someone', 'denied', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('x.s1@think-up.academy', 'student', 'x_stud')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student', 'link self to an ambassador row', 'denied', pg_temp.try($q$update ambassadors set profile_id = 'x_stud2' where full_name = 'X Elev'$q$));
reset role;

-- Student without an ambassador row: has an account, but no platform.
select set_config('request.jwt.claims', '{"sub":"x_stud2","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('student_unlinked', 'can_access_platform', 'false', pg_temp.val($q$select can_access_platform()::text$q$));
reset role;

-- =====================================================================
-- Tech / MK mentors: intranet as before, nothing from PN or the platform
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"x_tech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'can_access_platform', 'false', pg_temp.val($q$select can_access_platform()::text$q$)),
  ('mentor_tech', 'student profiles hidden', '0', pg_temp.cnt($q$select 1 from profiles where role = 'student'$q$)),
  ('mentor_tech', 'staff profiles still visible', 'yes', pg_temp.val($q$select case when count(*) >= 6 then 'yes' end from profiles$q$)),
  ('mentor_tech', 'ambassadors', '0', pg_temp.cnt($q$select 1 from ambassadors$q$)),
  ('mentor_tech', 'schools', '0', pg_temp.cnt($q$select 1 from schools$q$)),
  ('mentor_tech', 'departments still visible', '3', pg_temp.cnt($q$select 1 from departments$q$)),
  ('mentor_tech', 'announcements still visible', 'yes', pg_temp.val($q$select case when count(*) >= 1 then 'yes' end from announcements where title = 'X anunt'$q$)),
  ('mentor_tech', 'own department task still visible', '1', pg_temp.cnt($q$select 1 from tasks where title = 'X task Tech'$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"x_mk","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_mk', 'can_access_platform', 'false', pg_temp.val($q$select can_access_platform()::text$q$)),
  ('mentor_mk', 'student profiles hidden', '0', pg_temp.cnt($q$select 1 from profiles where role = 'student'$q$)),
  ('mentor_mk', 'ambassadors', '0', pg_temp.cnt($q$select 1 from ambassadors$q$));
reset role;

-- Tech mentor who is also an ambassador: platform yes, but still no PN data.
select set_config('request.jwt.claims', '{"sub":"x_techamb","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('tech_ambassador', 'is_staff', 'true', pg_temp.val($q$select is_staff()::text$q$)),
  ('tech_ambassador', 'can_access_platform', 'true', pg_temp.val($q$select can_access_platform()::text$q$)),
  ('tech_ambassador', 'ambassadors (not even own row)', '0', pg_temp.cnt($q$select 1 from ambassadors$q$)),
  ('tech_ambassador', 'schools', '0', pg_temp.cnt($q$select 1 from schools$q$)),
  ('tech_ambassador', 'ambassador_contacts', '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$)),
  ('tech_ambassador', 'student profiles hidden', '0', pg_temp.cnt($q$select 1 from profiles where role = 'student'$q$));
reset role;

-- VP Tech cannot invite or manage students.
select set_config('request.jwt.claims', '{"sub":"x_vptech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'invite student', 'denied', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('x.s2@think-up.academy', 'student', 'x_vptech')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'deactivate student', 'denied', pg_temp.try($q$select set_user_active('x_stud2', false)$q$));
reset role;

-- =====================================================================
-- PN mentor: sees students, invites and manages them
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"x_pn","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'can_access_platform', 'true', pg_temp.val($q$select can_access_platform()::text$q$)),
  ('mentor_pn', 'student profiles visible', '2', pg_temp.cnt($q$select 1 from profiles where role = 'student' and clerk_id like 'x\_%'$q$)),
  ('mentor_pn', 'sees ambassador links', '2', pg_temp.cnt($q$select 1 from ambassadors where profile_id like 'x\_%'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'invite student', 'ok', pg_temp.try($q$insert into invitations (email, role, invited_by) values ('x.s3@think-up.academy', 'student', 'x_pn')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'invite student into a department', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('x.s4@think-up.academy', 'student', (select id from departments where name = 'PN'), 'x_pn')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'invite a mentor', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by) values ('x.s5@think-up.academy', 'mentor', (select id from departments where name = 'PN'), 'x_pn')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'link student to ambassador row', 'ok', pg_temp.try($q$update ambassadors set profile_id = 'x_stud2' where full_name = 'X Elev'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'deactivate student', 'ok', pg_temp.try($q$select set_user_active('x_stud2', false)$q$)),
  ('mentor_pn', 'deactivate Tech mentor', 'denied', pg_temp.try($q$select set_user_active('x_tech', false)$q$));
reset role;

-- =====================================================================
-- CEO: sees students; nobody assigns a task to a student
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"x_ceo","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'student profiles visible', '2', pg_temp.cnt($q$select 1 from profiles where role = 'student' and clerk_id like 'x\_%'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'create task assigned to student', 'denied', pg_temp.try($q$insert into tasks (title, creator_id, assignee_id, department_id) values ('X t', 'x_ceo', 'x_stud', (select id from departments where name = 'Tech'))$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'reassign task to student', 'denied', pg_temp.try($q$update tasks set assignee_id = 'x_stud' where title = 'X task Tech'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'assign task to staff still works', 'ok', pg_temp.try($q$update tasks set assignee_id = 'x_tech' where title = 'X task Tech'$q$));
reset role;

-- A signed-in Clerk user with no profile sees nothing (docs 'all' used to leak).
select set_config('request.jwt.claims', '{"sub":"x_nobody","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('no_profile', 'documents (visibility all)', '0', pg_temp.cnt($q$select 1 from documents$q$)),
  ('no_profile', 'can_access_platform', 'false', pg_temp.val($q$select can_access_platform()::text$q$));
reset role;
