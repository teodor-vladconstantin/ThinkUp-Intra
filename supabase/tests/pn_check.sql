-- Phase 4: zones, move_county, schools, contact log, ambassadors, logs without contacts.
-- Run with: bun run rls:check supabase/tests/pn_check.sql   (always rolled back)

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

-- ---------- fixtures ----------
insert into profiles (clerk_id, email, full_name, role, department_id) values
  ('p_vp',     'p.vp@think-up.academy',     'P VP PN',      'vp',        (select id from departments where name = 'PN')),
  ('p_mentor', 'p.mentor@think-up.academy', 'P Mentor PN',  'mentor',    (select id from departments where name = 'PN')),
  ('p_sec',    'p.sec@think-up.academy',    'P Secretary',  'secretary', null),
  ('p_vptech', 'p.vptech@think-up.academy', 'P VP Tech',    'vp',        (select id from departments where name = 'Tech')),
  ('p_tech',   'p.tech@think-up.academy',   'P Mentor Tech','mentor',    (select id from departments where name = 'Tech'));

-- =====================================================================
-- VP PN: zones and county moves
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"p_vp","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'create zone', 'ok', pg_temp.try($q$insert into zones (name, color) values ('P Nord', '#7C3AED')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'create zone with invalid color', 'denied', pg_temp.try($q$insert into zones (name, color) values ('P Bad', 'purple')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'rename zone', 'ok', pg_temp.try($q$update zones set name = 'P Nord-Vest', color = '#2563EB' where name = 'P Nord'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'move CJ into zone', 'ok', pg_temp.try($q$select move_county('CJ', (select id from zones where name = 'P Nord-Vest'))$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'CJ now in zone', 'P Nord-Vest', pg_temp.val($q$select z.name from counties c join zones z on z.id = c.zone_id where c.code = 'CJ'$q$)),
  ('vp_pn', 'move recorded in history', '1', pg_temp.cnt($q$select 1 from county_zone_history where county_code = 'CJ' and changed_by = 'p_vp'$q$)),
  ('vp_pn', 'direct county update blocked (only move_county)', 'denied', pg_temp.try($q$update counties set zone_id = null where code = 'CJ'$q$));
reset role;

-- =====================================================================
-- Others: who may NOT edit zones / move counties
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"p_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'create zone', 'denied', pg_temp.try($q$insert into zones (name, color) values ('P M', '#000000')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'move county', 'denied', pg_temp.try($q$select move_county('CJ', null)$q$)),
  ('mentor_pn', 'sees map (42 counties)', '42', pg_temp.cnt($q$select 1 from counties$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"p_vptech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'move county', 'denied', pg_temp.try($q$select move_county('CJ', null)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'create zone', 'denied', pg_temp.try($q$insert into zones (name, color) values ('P T', '#000000')$q$)),
  ('vp_tech', 'sees no counties', '0', pg_temp.cnt($q$select 1 from counties$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"p_sec","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'move county', 'denied', pg_temp.try($q$select move_county('CJ', null)$q$)),
  ('secretary', 'sees map and history', '1', pg_temp.cnt($q$select 1 from county_zone_history where county_code = 'CJ'$q$));
reset role;

-- =====================================================================
-- Schools, contact log, logs without contacts
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"p_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'create school with contacts', 'ok', pg_temp.try($q$insert into schools (name, city, county_code, contact_name, contact_email, contact_phone) values ('P Liceu', 'Cluj-Napoca', 'CJ', 'Prof X', 'prof@liceu.ro', '0700111222')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'update school contact', 'ok', pg_temp.try($q$update schools set contact_phone = '0700999888', status = 'interested' where name = 'P Liceu'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'log a contact', 'ok', pg_temp.try($q$insert into school_contact_log (school_id, contacted_by, note) select id, 'p_mentor', 'Sunat' from schools where name = 'P Liceu'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'log a contact as someone else', 'denied', pg_temp.try($q$insert into school_contact_log (school_id, contacted_by, note) select id, 'p_vp', 'X' from schools where name = 'P Liceu'$q$));
reset role;

-- As table owner: the school was logged, but without any contact field.
insert into rls_results (persona, check_name, expected, actual) values
  ('audit', 'school changes are logged', '2', pg_temp.cnt($q$select 1 from activity_log where entity = 'schools' and entity_id = (select id::text from schools where name = 'P Liceu')$q$)),
  ('audit', 'no contact data in the log', '0', pg_temp.cnt($q$select 1 from activity_log where entity = 'schools' and diff::text ~ '(contact_|prof@liceu|0700)'$q$));

select set_config('request.jwt.claims', '{"sub":"p_tech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'create school', 'denied', pg_temp.try($q$insert into schools (name, county_code) values ('P X', 'CJ')$q$)),
  ('mentor_tech', 'sees no schools', '0', pg_temp.cnt($q$select 1 from schools$q$));
reset role;

-- =====================================================================
-- Ambassadors
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"p_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'add ambassador with contacts', 'ok', pg_temp.try($q$select add_ambassador('P Elev', (select id from schools where name = 'P Liceu'), 'elev@x.ro', '')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'empty phone stored as null', 'null', pg_temp.val($q$select c.phone from ambassador_contacts c join ambassadors a on a.id = c.ambassador_id where a.full_name = 'P Elev'$q$)),
  ('mentor_pn', 'add ambassador without contacts -> no contacts row', 'ok', pg_temp.try($q$select add_ambassador('P Elev 2', (select id from schools where name = 'P Liceu'), ' ', null)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'contacts rows', '1', pg_temp.cnt($q$select 1 from ambassador_contacts$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"p_sec","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'sees ambassadors', '2', pg_temp.cnt($q$select 1 from ambassadors$q$)),
  ('secretary', 'sees no ambassador contacts', '0', pg_temp.cnt($q$select 1 from ambassador_contacts$q$)),
  ('secretary', 'sees school contacts (PN module access)', 'prof@liceu.ro', pg_temp.val($q$select contact_email from schools where name = 'P Liceu'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'add ambassador', 'denied', pg_temp.try($q$select add_ambassador('P S', (select id from schools where name = 'P Liceu'), null, null)$q$));
reset role;

-- =====================================================================
-- Task linked to a school: visible task, hidden school (PRD 6.2 edge case)
-- =====================================================================
insert into tasks (title, creator_id, assignee_id, department_id, school_id)
select 'P task with school', 'p_vptech', 'p_tech', (select id from departments where name = 'Tech'), id from schools where name = 'P Liceu';

select set_config('request.jwt.claims', '{"sub":"p_tech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'sees the task', '1', pg_temp.cnt($q$select 1 from tasks where title = 'P task with school'$q$)),
  ('mentor_tech', 'school id is visible on the task', 'yes', pg_temp.val($q$select case when school_id is not null then 'yes' end from tasks where title = 'P task with school'$q$)),
  ('mentor_tech', 'school row itself is hidden', '0', pg_temp.cnt($q$select 1 from schools s join tasks t on t.school_id = s.id where t.title = 'P task with school'$q$));
reset role;

-- =====================================================================
-- Editing ambassador contacts (upsert / delete when both empty)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"p_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'contacts: upsert for ambassador without row', 'ok', pg_temp.try($q$insert into ambassador_contacts (ambassador_id, phone) select id, '0711000000' from ambassadors where full_name = 'P Elev 2' on conflict (ambassador_id) do update set phone = excluded.phone$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'contacts: delete when cleared', 'ok', pg_temp.try($q$delete from ambassador_contacts where ambassador_id = (select id from ambassadors where full_name = 'P Elev')$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"p_sec","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'contacts: edit', 'denied', pg_temp.try($q$insert into ambassador_contacts (ambassador_id, phone) select id, '0' from ambassadors where full_name = 'P Elev 2' on conflict (ambassador_id) do update set phone = excluded.phone$q$));
reset role;
