-- Platform step 2: projects, members, content, reviews, grading, warnings, Open School.
-- Run with: bun run rls:check supabase/tests/platform_schema_check.sql   (always rolled back)

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

-- run a statement as a persona
create function pg_temp.as_user(sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
end $$;

-- ---------- fixtures (as table owner) ----------
insert into profiles (clerk_id, email, full_name, role, department_id) values
  ('y_ceo',     'y.ceo@think-up.academy',     'Y CEO',          'ceo',     null),
  ('y_vppn',    'y.vppn@think-up.academy',    'Y VP PN',        'vp',      (select id from departments where name = 'PN')),
  ('y_pn',      'y.pn@think-up.academy',      'Y Mentor PN',    'mentor',  (select id from departments where name = 'PN')),
  ('y_pn2',     'y.pn2@think-up.academy',     'Y Mentor PN 2',  'mentor',  (select id from departments where name = 'PN')),
  ('y_tech',    'y.tech@think-up.academy',    'Y Mentor Tech',  'mentor',  (select id from departments where name = 'Tech')),
  ('y_techamb', 'y.techamb@think-up.academy', 'Y Tech Amb',     'mentor',  (select id from departments where name = 'Tech')),
  ('y_a',       'y.a@think-up.academy',       'Y Elev A',       'student', null),
  ('y_b',       'y.b@think-up.academy',       'Y Elev B',       'student', null),
  ('y_unlinked','y.u@think-up.academy',       'Y Elev Nelegat', 'student', null);

insert into schools (name, county_code) values ('Y Liceu', 'CJ');
insert into ambassadors (full_name, school_id, profile_id)
select n, (select id from schools where name = 'Y Liceu'), p
from (values ('Y Elev A', 'y_a'), ('Y Elev B', 'y_b'), ('Y Tech Amb', 'y_techamb')) v(n, p);

set local role authenticated;

-- =====================================================================
-- Student A: creates a project, becomes member, edits its content
-- =====================================================================
select pg_temp.as_user('y_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'create project', 'ok', pg_temp.try($q$insert into projects (name, created_by) values ('Y Proiect A', 'y_a')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'create project as someone else', 'denied', pg_temp.try($q$insert into projects (name, created_by) values ('Y Fals', 'y_b')$q$)),
  ('student_a', 'creator is a member', '1', pg_temp.cnt($q$select 1 from project_members m join projects p on p.id = m.project_id where p.name = 'Y Proiect A' and m.profile_id = 'y_a'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'add goal', 'ok', pg_temp.try($q$insert into goals (project_id, name, progress) select id, 'Y Goal A', 10 from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'goal progress over 100', 'denied', pg_temp.try($q$update goals set progress = 150 where name = 'Y Goal A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'add material', 'ok', pg_temp.try($q$insert into materials (project_id, name, created_by) select id, 'Y Mat A', 'y_a' from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'add file to material', 'ok', pg_temp.try($q$insert into material_files (material_id, name, storage_path) select id, 'f.pdf', project_id || '/f.pdf' from materials where name = 'Y Mat A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'change project creator', 'denied', pg_temp.try($q$update projects set created_by = 'y_b' where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'add Tech mentor (no platform) as member', 'denied', pg_temp.try($q$insert into project_members (project_id, profile_id) select id, 'y_tech' from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'review own project', 'denied', pg_temp.try($q$insert into reviews (project_id, author_id, rating) select id, 'y_a', 5 from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'personal objective', 'ok', pg_temp.try($q$insert into personal_objectives (owner_id, name) values ('y_a', 'Y Obiectiv A')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'create challenge', 'denied', pg_temp.try($q$insert into challenges (name, created_by) values ('Y Ch fals', 'y_a')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'platform_people hides Tech mentor', '0', pg_temp.cnt($q$select 1 from platform_people where clerk_id = 'y_tech'$q$)),
  ('student_a', 'platform_people shows peers and PN', '4', pg_temp.cnt($q$select 1 from platform_people where clerk_id in ('y_b', 'y_pn', 'y_techamb', 'y_a')$q$)),
  ('student_a', 'platform_people: PN mentor badge', 'true', pg_temp.val($q$select is_mentor::text from platform_people where clerk_id = 'y_pn'$q$)),
  ('student_a', 'platform_people: unlinked student hidden', '0', pg_temp.cnt($q$select 1 from platform_people where clerk_id = 'y_unlinked'$q$));

-- =====================================================================
-- Student B: sees everything, edits nothing of A's
-- =====================================================================
select pg_temp.as_user('y_b');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'sees A project', '1', pg_temp.cnt($q$select 1 from projects where name = 'Y Proiect A'$q$)),
  ('student_b', 'sees A goals', '1', pg_temp.cnt($q$select 1 from goals where name = 'Y Goal A'$q$)),
  ('student_b', 'A personal objectives hidden', '0', pg_temp.cnt($q$select 1 from personal_objectives where owner_id = 'y_a'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'edit A project', 'denied', pg_temp.try($q$update projects set name = 'hacked' where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'edit A goal', 'denied', pg_temp.try($q$update goals set name = 'hacked' where name = 'Y Goal A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'add goal to A project', 'denied', pg_temp.try($q$insert into goals (project_id, name) select id, 'Y intrus' from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'add self to A project', 'denied', pg_temp.try($q$insert into project_members (project_id, profile_id) select id, 'y_b' from projects where name = 'Y Proiect A'$q$));
-- old thinkup bug: a goal could be moved/overwritten into another project
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'create own project', 'ok', pg_temp.try($q$insert into projects (name, created_by) values ('Y Proiect B', 'y_b')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'own goal', 'ok', pg_temp.try($q$insert into goals (project_id, name) select id, 'Y Goal B' from projects where name = 'Y Proiect B'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'move own goal into A project', 'denied', pg_temp.try($q$update goals set project_id = (select id from projects where name = 'Y Proiect A') where name = 'Y Goal B'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'review A project', 'ok', pg_temp.try($q$insert into reviews (project_id, author_id, rating, body) select id, 'y_b', 4, 'bun' from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_b', 'second review same project', 'denied', pg_temp.try($q$insert into reviews (project_id, author_id, rating) select id, 'y_b', 1 from projects where name = 'Y Proiect A'$q$));

-- A turns reviews off, adds B, cannot remove self (creator), removes B
select pg_temp.as_user('y_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'turn reviews off', 'ok', pg_temp.try($q$update projects set accept_reviews = false where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'add B as member', 'ok', pg_temp.try($q$insert into project_members (project_id, profile_id) select id, 'y_b' from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'remove creator', 'denied', pg_temp.try($q$delete from project_members where profile_id = 'y_a' and project_id = (select id from projects where name = 'Y Proiect A')$q$));

select pg_temp.as_user('y_techamb');
insert into rls_results (persona, check_name, expected, actual) values
  ('tech_ambassador', 'sees projects', 'yes', pg_temp.val($q$select case when count(*) >= 2 then 'yes' end from projects where name like 'Y Proiect%'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('tech_ambassador', 'review when reviews are off', 'denied', pg_temp.try($q$insert into reviews (project_id, author_id, rating) select id, 'y_techamb', 3 from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('tech_ambassador', 'create challenge', 'denied', pg_temp.try($q$insert into challenges (name, created_by) values ('Y x', 'y_techamb')$q$));

-- =====================================================================
-- PN mentor: challenges, grading, feedback, warnings, Open School, puzzle
-- =====================================================================
select pg_temp.as_user('y_pn');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'create challenge', 'ok', pg_temp.try($q$insert into challenges (name, max_score, created_by) values ('Y Challenge', 50, 'y_pn')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'grade project (A + B)', '2', pg_temp.val($q$select grade_project((select id from projects where name = 'Y Proiect A'), (select id from challenges where name = 'Y Challenge'), 40, 'ok')::text$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'score above max', 'denied', pg_temp.try($q$update submissions set score = 51 where student_id = 'y_a'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'grade a Tech mentor (no platform)', 'denied', pg_temp.try($q$insert into submissions (challenge_id, student_id, score, graded_by) select id, 'y_tech', 1, 'y_pn' from challenges where name = 'Y Challenge'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'feedback on A project', 'ok', pg_temp.try($q$insert into mentor_feedback (project_id, mentor_id, body) select id, 'y_pn', 'bravo' from projects where name = 'Y Proiect A'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'warn student A', 'ok', pg_temp.try($q$insert into warnings (student_id, issued_by, body) values ('y_a', 'y_pn', 'Y avertisment')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'warn Tech mentor (no platform)', 'denied', pg_temp.try($q$insert into warnings (student_id, issued_by, body) values ('y_tech', 'y_pn', 'x')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'reads A personal objectives', '1', pg_temp.cnt($q$select 1 from personal_objectives where owner_id = 'y_a'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'upload Open School file', 'ok', pg_temp.try($q$insert into open_school_files (name, storage_path, uploaded_by) values ('Y Curs', 'os/y.pdf', 'y_pn')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'give puzzle piece to A', 'ok', pg_temp.try($q$insert into puzzle_pieces (profile_id, piece, given_by) values ('y_a', 1, 'y_pn')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'give puzzle piece to Tech mentor', 'denied', pg_temp.try($q$insert into puzzle_pieces (profile_id, piece, given_by) values ('y_tech', 1, 'y_pn')$q$));

-- Another PN mentor cannot archive someone else's warning; the VP PN can.
select pg_temp.as_user('y_pn2');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn2', 'archive other mentor warning', 'denied', pg_temp.try($q$update warnings set archived = true where body = 'Y avertisment'$q$));
select pg_temp.as_user('y_vppn');
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_pn', 'archive any warning', 'ok', pg_temp.try($q$update warnings set archived = true where body = 'Y avertisment'$q$));

-- =====================================================================
-- Students see their own grades and warnings only
-- =====================================================================
select pg_temp.as_user('y_a');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'own grade', '40', pg_temp.val($q$select score::text from submissions where student_id = 'y_a'$q$)),
  ('student_a', 'B grade hidden', '0', pg_temp.cnt($q$select 1 from submissions where student_id = 'y_b'$q$)),
  ('student_a', 'own warning', '1', pg_temp.cnt($q$select 1 from warnings where student_id = 'y_a'$q$)),
  ('student_a', 'sees mentor feedback', '1', pg_temp.cnt($q$select 1 from mentor_feedback where body = 'bravo'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'raise own grade', 'denied', pg_temp.try($q$update submissions set score = 50 where student_id = 'y_a'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'grade self', 'denied', pg_temp.try($q$insert into submissions (challenge_id, student_id, score, graded_by) select id, 'y_a', 1, 'y_a' from challenges where name = 'Y Challenge'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'count an Open School view', 'ok', pg_temp.try($q$select open_school_view((select id from open_school_files where name = 'Y Curs'))$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'view counted', '1', pg_temp.val($q$select views::text from open_school_files where name = 'Y Curs'$q$)),
  ('student_a', 'favorite a file', 'ok', pg_temp.try($q$insert into open_school_favorites (profile_id, file_id) select 'y_a', id from open_school_files where name = 'Y Curs'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'rename Open School file', 'denied', pg_temp.try($q$update open_school_files set name = 'x' where name = 'Y Curs'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'set own platform profile', 'ok', pg_temp.try($q$insert into platform_profiles (profile_id, bio) values ('y_a', 'salut')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_a', 'set B platform profile', 'denied', pg_temp.try($q$insert into platform_profiles (profile_id, bio) values ('y_b', 'x')$q$));

-- =====================================================================
-- Outside the platform: Tech mentor, unlinked student
-- =====================================================================
select pg_temp.as_user('y_tech');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'projects', '0', pg_temp.cnt($q$select 1 from projects$q$)),
  ('mentor_tech', 'project_members', '0', pg_temp.cnt($q$select 1 from project_members$q$)),
  ('mentor_tech', 'goals', '0', pg_temp.cnt($q$select 1 from goals$q$)),
  ('mentor_tech', 'challenges', '0', pg_temp.cnt($q$select 1 from challenges$q$)),
  ('mentor_tech', 'submissions', '0', pg_temp.cnt($q$select 1 from submissions$q$)),
  ('mentor_tech', 'warnings', '0', pg_temp.cnt($q$select 1 from warnings$q$)),
  ('mentor_tech', 'reviews', '0', pg_temp.cnt($q$select 1 from reviews$q$)),
  ('mentor_tech', 'mentor_feedback', '0', pg_temp.cnt($q$select 1 from mentor_feedback$q$)),
  ('mentor_tech', 'open_school_files', '0', pg_temp.cnt($q$select 1 from open_school_files$q$)),
  ('mentor_tech', 'puzzle_pieces', '0', pg_temp.cnt($q$select 1 from puzzle_pieces$q$)),
  ('mentor_tech', 'platform_people', '0', pg_temp.cnt($q$select 1 from platform_people$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'create project', 'denied', pg_temp.try($q$insert into projects (name, created_by) values ('Y Tech', 'y_tech')$q$));

select pg_temp.as_user('y_unlinked');
insert into rls_results (persona, check_name, expected, actual) values
  ('student_unlinked', 'projects', '0', pg_temp.cnt($q$select 1 from projects$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('student_unlinked', 'create project', 'denied', pg_temp.try($q$insert into projects (name, created_by) values ('Y U', 'y_unlinked')$q$));

-- CEO: views the platform (PN tangent), does not grade
select pg_temp.as_user('y_ceo');
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'sees projects', 'yes', pg_temp.val($q$select case when count(*) >= 2 then 'yes' end from projects where name like 'Y Proiect%'$q$)),
  ('ceo', 'sees grades', '0', pg_temp.cnt($q$select 1 from submissions$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'grade', 'denied', pg_temp.try($q$insert into submissions (challenge_id, student_id, score, graded_by) select id, 'y_b', 1, 'y_ceo' from challenges where name = 'Y Challenge'$q$));

reset role;
