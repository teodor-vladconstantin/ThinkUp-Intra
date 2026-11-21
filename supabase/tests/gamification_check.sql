-- Gamification RLS checks. Run with: bun run rls:check supabase/tests/gamification_check.sql

create temp table rls_results (
  id serial,
  persona text,
  check_name text,
  expected text,
  actual text
);
grant all on rls_results to public;
grant usage on sequence rls_results_id_seq to public;

insert into profiles (clerk_id, email, full_name, role, is_active) values
  ('gam_student_a', 'gam.a@example.com', 'Gam Student A', 'student', true),
  ('gam_student_b', 'gam.b@example.com', 'Gam Student B', 'student', true),
  ('gam_student_none', 'gam.none@example.com', 'Gam Student None', 'student', true);

insert into zones (name, color, active) values ('Gam Zone', '#123456', true);
insert into counties (code, name, zone_id) values ('GA', 'Gam County', (select id from zones where name='Gam Zone'));
insert into schools (id, name, county_code) values (910001, 'Gam School', 'GA');
insert into ambassadors (id, full_name, school_id, profile_id, active) values
  (910001, 'Gam Ambassador A', 910001, 'gam_student_a', true),
  (910002, 'Gam Ambassador B', 910001, 'gam_student_b', true);

insert into xp_events (profile_id, kind, xp) values
  ('gam_student_a', 'material', 5),
  ('gam_student_b', 'photo', 5),
  ('gam_student_none', 'material', 5);
insert into user_badges (profile_id, badge_key) values
  ('gam_student_a', 'first'),
  ('gam_student_b', 'steady');

create function pg_temp.cnt(q text) returns text language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') s' into n; return n::text; end $$;

create function pg_temp.try(q text) returns text language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n=row_count; return case when n>0 then 'ok' else 'denied' end;
exception when others then return 'denied'; end $$;

-- Elev A: vede doar propriul XP/badge și clasamentele la care participă.
select set_config('request.jwt.claims', '{"sub":"gam_student_a","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (persona, check_name, expected, actual) values
  ('student_a','xp_events: own XP','1',pg_temp.cnt($q$select 1 from xp_events where profile_id like 'gam_%'$q$)),
  ('student_a','user_badges: own badge','1',pg_temp.cnt($q$select 1 from user_badges where profile_id like 'gam_%'$q$)),
  ('student_a','leaderboard: school participates','1',pg_temp.cnt($q$select 1 from gamification_leaderboard('school','week',10) r where r.profile_id='gam_student_a'$q$)),
  ('student_a','aggregate: county average XP','1',pg_temp.cnt($q$select 1 from gamification_aggregate('county','week') where id='GA' and avg_xp=5 and active_students=2$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a','xp_events: direct insert denied','denied',pg_temp.try($q$insert into xp_events(profile_id,kind,xp) values('gam_student_a','material',100)$q$)),
  ('student_a','user_badges: direct insert denied','denied',pg_temp.try($q$insert into user_badges(profile_id,badge_key) values('gam_student_a','points')$q$));
reset role;

-- Elev fără ambasador: niciun clasament și niciun rând propriul.
select set_config('request.jwt.claims', '{"sub":"gam_student_none","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('student_none','xp_events: own XP','1',pg_temp.cnt($q$select 1 from xp_events where profile_id='gam_student_none'$q$)),
  ('student_none','leaderboard: no school row','0',pg_temp.cnt($q$select 1 from gamification_leaderboard('school','week',10)$q$)),
  ('student_none','aggregate: inaccessible','0',pg_temp.cnt($q$select 1 from gamification_aggregate('county','week')$q$)),
  ('student_none','progress: no ranks without activity','0',pg_temp.cnt($q$select 1 from jsonb_each(gamification_my_progress()->'ranks') where value is distinct from 'null'::jsonb$q$));
reset role;

-- PN vede tot.
insert into profiles (clerk_id, email, full_name, role, department_id, is_active)
values ('gam_pn', 'gam.pn@example.com', 'Gam PN', 'vp', (select id from departments where name='PN'), true)
on conflict (clerk_id) do update set department_id=excluded.department_id;
select set_config('request.jwt.claims', '{"sub":"gam_pn","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('pn','xp_events: sees all','3',pg_temp.cnt($q$select 1 from xp_events where profile_id like 'gam_%'$q$)),
  ('pn','user_badges: sees all','2',pg_temp.cnt($q$select 1 from user_badges where profile_id like 'gam_%'$q$)),
  ('pn','is_pn_dept helper','true',case when is_pn_dept() then 'true' else 'false' end),
  ('pn','leaderboard: sees all participants','2',pg_temp.cnt($q$select 1 from gamification_leaderboard('country','week',10) where profile_id like 'gam_%'$q$));
reset role;

-- Anon nu poate scrie XP/badge.
set local role anon;
insert into rls_results (persona, check_name, expected, actual) values
  ('anon','xp_events: direct insert denied','denied',pg_temp.try($q$insert into xp_events(profile_id,kind,xp) values('gam_student_a','material',100)$q$)),
  ('anon','user_badges: direct insert denied','denied',pg_temp.try($q$insert into user_badges(profile_id,badge_key) values('gam_student_a','points')$q$));
reset role;
