-- Platform gallery: only the board sees it; nobody else, not even by other routes.
-- Run with: bun run rls:check supabase/tests/gallery_check.sql   (always rolled back)

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

create function pg_temp.as_user(sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
end $$;

-- ---------- fixtures (as table owner) ----------
insert into profiles (clerk_id, email, full_name, role, department_id, is_superadmin) values
  ('q_super',  'q.super@think-up.academy',  'Q Superadmin',   'mentor',  (select id from departments where name = 'Tech'), true),
  ('q_ceo',    'q.ceo@think-up.academy',    'Q CEO',          'ceo',       null, false),
  ('q_pres',   'q.pres@think-up.academy',   'Q Presedinte',   'president', null, false),
  ('q_sec',    'q.sec@think-up.academy',    'Q Secretar',     'secretary', null, false),
  ('q_vppn',   'q.vppn@think-up.academy',   'Q VP PN',        'vp',      (select id from departments where name = 'PN'),   false),
  ('q_vptech', 'q.vptech@think-up.academy', 'Q VP Tech',      'vp',      (select id from departments where name = 'Tech'), false),
  ('q_vpmk',   'q.vpmk@think-up.academy',   'Q VP MK',        'vp',      (select id from departments where name = 'MK'),   false),
  ('q_mpn',    'q.mpn@think-up.academy',    'Q Mentor PN',    'mentor',  (select id from departments where name = 'PN'),   false),
  ('q_mtech',  'q.mtech@think-up.academy',  'Q Mentor Tech',  'mentor',  (select id from departments where name = 'Tech'), false),
  ('q_mmk',    'q.mmk@think-up.academy',    'Q Mentor MK',    'mentor',  (select id from departments where name = 'MK'),   false),
  ('q_stud',   'q.stud@think-up.academy',   'Q Elev',         'student', null, false);

insert into schools (name, county_code) values ('Q Liceu', 'CJ');
insert into ambassadors (full_name, school_id, profile_id) values ('Q Elev', (select id from schools where name = 'Q Liceu'), 'q_stud');
insert into challenges (name, created_by) values ('Q Challenge', 'q_mpn');
insert into projects (name, created_by, challenge_id) values ('Q Proiect cu challenge', 'q_stud', (select id from challenges where name = 'Q Challenge'));
insert into projects (name, created_by) values ('Q Proiect fara challenge', 'q_stud');

create temp table q_ids as
select (select id from projects where name = 'Q Proiect cu challenge')::text as p1,
       (select id from projects where name = 'Q Proiect fara challenge')::text as p2,
       (select id from challenges where name = 'Q Challenge')::text as ch;
grant select on q_ids to public;

insert into project_photos (project_id, storage_path)
select p1::uuid, p1 || '/a.png' from q_ids union all
select p1::uuid, p1 || '/b.png' from q_ids union all
select p2::uuid, p2 || '/c.png' from q_ids;

-- ---------- the board: sees the photos, with their source ----------
select pg_temp.as_user('q_super');
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'sees all photos of the project', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$)),
  ('superadmin', 'source: challenge name', 'Q Challenge', pg_temp.val($q$select challenge_name from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$)),
  ('superadmin', 'source: project name', 'Q Proiect cu challenge', pg_temp.val($q$select project_name from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$)),
  ('superadmin', 'project without challenge: challenge is null', 'null', pg_temp.val($q$select challenge_name from gallery_photos(p_project => (select p2::uuid from q_ids)) limit 1$q$)),
  ('superadmin', 'filter: no challenge', '1', pg_temp.cnt($q$select 1 from gallery_photos(p_no_challenge => true) g where g.project_id = (select p2::uuid from q_ids)$q$)),
  ('superadmin', 'filter: by challenge', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_challenge => (select ch::uuid from q_ids))$q$)),
  ('superadmin', 'total counts the whole filtered set', '2', pg_temp.val($q$select max(total)::text from gallery_photos(p_challenge => (select ch::uuid from q_ids), p_limit => 1)$q$)),
  ('superadmin', 'limit applies', '1', pg_temp.cnt($q$select 1 from gallery_photos(p_challenge => (select ch::uuid from q_ids), p_limit => 1)$q$)),
  ('superadmin', 'team names visible (on the platform)', 'false', pg_temp.val($q$select (team is null)::text from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$)),
  ('superadmin', 'sources list', '2', pg_temp.cnt($q$select 1 from gallery_sources() s where s.project_id in (select p1::uuid from q_ids union select p2::uuid from q_ids)$q$));
reset role;

-- every board role: same photos
select pg_temp.as_user('q_ceo'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'sees photos', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$));
reset role;
select pg_temp.as_user('q_pres'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('president', 'sees photos', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$));
reset role;
select pg_temp.as_user('q_sec'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'sees photos', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$));
reset role;
select pg_temp.as_user('q_vppn'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'sees photos', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$)),
  ('vp_pn', 'team names visible', 'false', pg_temp.val($q$select (team is null)::text from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$));
reset role;

-- VP Tech / VP MK: the gallery yes, but still nothing else of the platform, and no student names
select pg_temp.as_user('q_vptech'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'sees photos', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$)),
  ('vp_tech', 'source: project and challenge shown', 'Q Challenge', pg_temp.val($q$select challenge_name from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$)),
  ('vp_tech', 'team names hidden (not on the platform)', 'true', pg_temp.val($q$select (team is null)::text from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$)),
  ('vp_tech', 'platform tables still closed: project_photos', '0', pg_temp.cnt($q$select 1 from project_photos$q$)),
  ('vp_tech', 'platform tables still closed: projects', '0', pg_temp.cnt($q$select 1 from projects$q$)),
  ('vp_tech', 'platform tables still closed: challenges', '0', pg_temp.cnt($q$select 1 from challenges$q$)),
  ('vp_tech', 'sources list', '2', pg_temp.cnt($q$select 1 from gallery_sources() s where s.project_id in (select p1::uuid from q_ids union select p2::uuid from q_ids)$q$));
reset role;
select pg_temp.as_user('q_vpmk'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_mk', 'sees photos', '2', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$)),
  ('vp_mk', 'team names hidden', 'true', pg_temp.val($q$select (team is null)::text from gallery_photos(p_project => (select p1::uuid from q_ids)) limit 1$q$));
reset role;

-- everyone else: nothing
select pg_temp.as_user('q_mpn'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'gallery_photos', '0', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$)),
  ('mentor_pn', 'gallery_sources', '0', pg_temp.cnt($q$select 1 from gallery_sources()$q$));
reset role;
select pg_temp.as_user('q_mtech'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'gallery_photos', '0', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$));
reset role;
select pg_temp.as_user('q_mmk'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_mk', 'gallery_photos', '0', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$));
reset role;
select pg_temp.as_user('q_stud'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('student', 'gallery_photos', '0', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$)),
  ('student', 'gallery_sources', '0', pg_temp.cnt($q$select 1 from gallery_sources()$q$));
reset role;
select pg_temp.as_user('q_nobody'); set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('no_profile', 'gallery_photos', '0', pg_temp.cnt($q$select 1 from gallery_photos(p_project => (select p1::uuid from q_ids))$q$));
reset role;

-- not callable without being signed in
set local role anon;
insert into rls_results (persona, check_name, expected, actual) values
  ('anon', 'gallery_photos execute', 'denied', pg_temp.try($q$select * from gallery_photos()$q$)),
  ('anon', 'gallery_sources execute', 'denied', pg_temp.try($q$select * from gallery_sources()$q$));
reset role;
