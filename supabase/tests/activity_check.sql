-- Activity log (streak): triggers write events, RLS keeps them private and tamper-proof.
-- Run with: bun run rls:check supabase/tests/activity_check.sql   (always rolled back)

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

create function pg_temp.as_user(sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
end $$;

-- ---------- fixtures (as table owner) ----------
insert into profiles (clerk_id, email, full_name, role, department_id) values
  ('z_pn', 'z.pn@think-up.academy', 'Z Mentor PN', 'mentor', (select id from departments where name = 'PN')),
  ('z_a',  'z.a@think-up.academy',  'Z Elev A',     'student', null),
  ('z_b',  'z.b@think-up.academy',  'Z Elev B',     'student', null);
insert into schools (name, county_code) values ('Z Liceu', 'CJ');
insert into ambassadors (full_name, school_id, profile_id)
select n, (select id from schools where name = 'Z Liceu'), p from (values ('Z Elev A', 'z_a'), ('Z Elev B', 'z_b')) v(n, p);

set local role authenticated;

-- ---------- student A works on a project ----------
select pg_temp.as_user('z_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'create project', 'ok', pg_temp.try($q$insert into projects (name, created_by) values ('Z Proiect', 'z_a')$q$)),
  ('student_a', 'add goal', 'ok', pg_temp.try($q$insert into goals (project_id, name, progress) select id, 'Z Goal', 10 from projects where name = 'Z Proiect'$q$)),
  ('student_a', 'adding a goal is not activity', '0', pg_temp.cnt($q$select 1 from activity_events$q$)),
  ('student_a', 'change progress', 'ok', pg_temp.try($q$update goals set progress = 50 where name = 'Z Goal'$q$)),
  ('student_a', 'same progress again changes nothing', 'ok', pg_temp.try($q$update goals set progress = 50, name = 'Z Goal 2' where name = 'Z Goal'$q$)),
  ('student_a', 'add material', 'ok', pg_temp.try($q$insert into materials (project_id, name, created_by) select id, 'Z Material', 'z_a' from projects where name = 'Z Proiect'$q$)),
  ('student_a', 'add photo', 'ok', pg_temp.try($q$insert into project_photos (project_id, storage_path) select id, id::text || '/photo.png' from projects where name = 'Z Proiect'$q$)),
  ('student_a', 'add material file', 'ok', pg_temp.try($q$insert into material_files (material_id, name, storage_path) select id, 'f.pdf', project_id::text || '/f.pdf' from materials where name = 'Z Material'$q$)),
  ('student_a', 'one event per real action (progress, material, photo, file)', '4', pg_temp.cnt($q$select 1 from activity_events$q$)),
  ('student_a', 'events are attributed to the actor', '4', pg_temp.cnt($q$select 1 from activity_events where profile_id = 'z_a'$q$)),
  ('student_a', 'one distinct week', '1', pg_temp.cnt($q$select 1 from activity_weeks$q$)),
  ('student_a', 'cannot insert an event', 'denied', pg_temp.try($q$insert into activity_events (profile_id, kind, project_id) select 'z_a', 'photo', id from projects$q$)),
  ('student_a', 'cannot edit an event', 'denied', pg_temp.try($q$update activity_events set kind = 'photo'$q$)),
  ('student_a', 'cannot delete an event', 'denied', pg_temp.try($q$delete from activity_events$q$));

-- ---------- student B sees none of it ----------
select pg_temp.as_user('z_b');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'sees no events of A', '0', pg_temp.cnt($q$select 1 from activity_events$q$)),
  ('student_b', 'sees no weeks of A', '0', pg_temp.cnt($q$select 1 from activity_weeks$q$));

-- ---------- PN mentor sees everything ----------
select pg_temp.as_user('z_pn');
insert into rls_results (persona, check_name, expected, actual) values
  ('pn_mentor', 'sees A''s events', '4', pg_temp.cnt($q$select 1 from activity_events where profile_id = 'z_a'$q$)),
  ('pn_mentor', 'sees A''s week', '1', pg_temp.cnt($q$select 1 from activity_weeks where profile_id = 'z_a'$q$)),
  ('pn_mentor', 'cannot insert an event', 'denied', pg_temp.try($q$insert into activity_events (profile_id, kind, project_id) select 'z_a', 'photo', id from projects$q$));
