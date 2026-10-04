-- Platform step 3: storage buckets and file-path rules.
-- Run with: bun run rls:check supabase/tests/platform_storage_check.sql   (always rolled back)
-- Inserts into storage.objects simulate what the Storage API does for the same user.
-- Deletes are not tested here: Storage blocks direct SQL deletes on its tables.

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
  ('z_pn',   'z.pn@think-up.academy',   'Z Mentor PN',   'mentor',  (select id from departments where name = 'PN')),
  ('z_tech', 'z.tech@think-up.academy', 'Z Mentor Tech', 'mentor',  (select id from departments where name = 'Tech')),
  ('z_a',    'z.a@think-up.academy',    'Z Elev A',      'student', null),
  ('z_b',    'z.b@think-up.academy',    'Z Elev B',      'student', null);
insert into schools (name, county_code) values ('Z Liceu', 'CJ');
insert into ambassadors (full_name, school_id, profile_id)
select n, (select id from schools where name = 'Z Liceu'), p from (values ('Z Elev A', 'z_a'), ('Z Elev B', 'z_b')) v(n, p);
insert into projects (name, created_by) values ('Z Proiect A', 'z_a'), ('Z Proiect B', 'z_b');   -- trigger adds creators
insert into materials (project_id, name, created_by) select id, 'Z Mat A', 'z_a' from projects where name = 'Z Proiect A';

create temp table z_ids as
select (select id from projects where name = 'Z Proiect A')::text as pa,
       (select id from projects where name = 'Z Proiect B')::text as pb;
grant select on z_ids to public;

set local role authenticated;

-- =====================================================================
-- project-files
-- =====================================================================
select pg_temp.as_user('z_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'upload into own project folder', 'ok', pg_temp.try($q$insert into storage.objects (bucket_id, name) select 'project-files', pa || '/poza.png' from z_ids$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'upload into B project folder', 'denied', pg_temp.try($q$insert into storage.objects (bucket_id, name) select 'project-files', pb || '/x.png' from z_ids$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'upload outside any project folder', 'denied', pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('project-files', 'random/x.png')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'photo row for own file', 'ok', pg_temp.try($q$insert into project_photos (project_id, storage_path) select pa::uuid, pa || '/poza.png' from z_ids$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'photo row pointing into B project', 'denied', pg_temp.try($q$insert into project_photos (project_id, storage_path) select pa::uuid, pb || '/x.png' from z_ids$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'material file in own project', 'ok', pg_temp.try($q$insert into material_files (material_id, name, storage_path) select m.id, 'f.pdf', z.pa || '/f.pdf' from materials m, z_ids z where m.name = 'Z Mat A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'material file pointing into B project', 'denied', pg_temp.try($q$insert into material_files (material_id, name, storage_path) select m.id, 'g.pdf', z.pb || '/g.pdf' from materials m, z_ids z where m.name = 'Z Mat A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'thumbnail from own project', 'ok', pg_temp.try($q$update projects set thumbnail_path = (select pa || '/poza.png' from z_ids) where name = 'Z Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'thumbnail from B project', 'denied', pg_temp.try($q$update projects set thumbnail_path = (select pb || '/x.png' from z_ids) where name = 'Z Proiect A'$q$));

select pg_temp.as_user('z_b');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'sees A project files', '1', pg_temp.cnt($q$select 1 from storage.objects o, z_ids z where o.bucket_id = 'project-files' and o.name = z.pa || '/poza.png'$q$));

select pg_temp.as_user('z_tech');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'project files hidden', '0', pg_temp.cnt($q$select 1 from storage.objects o, z_ids z where o.bucket_id = 'project-files' and o.name like z.pa || '/%'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'upload into A project', 'denied', pg_temp.try($q$insert into storage.objects (bucket_id, name) select 'project-files', pa || '/t.png' from z_ids$q$));

-- =====================================================================
-- avatars
-- =====================================================================
select pg_temp.as_user('z_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'upload own avatar', 'ok', pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('avatars', 'z_a/avatar.png')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'upload into B avatar folder', 'denied', pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('avatars', 'z_b/avatar.png')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'profile points at own avatar', 'ok', pg_temp.try($q$insert into platform_profiles (profile_id, avatar_path) values ('z_a', 'z_a/avatar.png')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'profile points at B avatar', 'denied', pg_temp.try($q$update platform_profiles set cover_path = 'z_b/avatar.png' where profile_id = 'z_a'$q$));

select pg_temp.as_user('z_tech');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'avatars hidden', '0', pg_temp.cnt($q$select 1 from storage.objects where bucket_id = 'avatars' and name like 'z\_%'$q$)),
  ('mentor_tech', 'upload own avatar (not on platform)', 'denied', pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('avatars', 'z_tech/a.png')$q$));

-- =====================================================================
-- open-school
-- =====================================================================
select pg_temp.as_user('z_pn');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'upload Open School file', 'ok', pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('open-school', 'z/curs.pdf')$q$));

select pg_temp.as_user('z_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'upload Open School file', 'denied', pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('open-school', 'z/x.pdf')$q$)),
  ('student_a', 'sees Open School file', '1', pg_temp.cnt($q$select 1 from storage.objects where bucket_id = 'open-school' and name = 'z/curs.pdf'$q$));

select pg_temp.as_user('z_tech');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'Open School hidden', '0', pg_temp.cnt($q$select 1 from storage.objects where bucket_id = 'open-school' and name = 'z/curs.pdf'$q$));

reset role;

-- buckets are private
insert into rls_results (persona, check_name, expected, actual) values
  ('owner', 'no public platform bucket', '0', pg_temp.cnt($q$select 1 from storage.buckets where id in ('project-files', 'avatars', 'open-school') and public$q$));
