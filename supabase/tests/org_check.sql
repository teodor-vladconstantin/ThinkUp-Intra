-- Phase 3: meetings (create_meeting), decisions, documents, announcements.
-- Run with: bun run rls:check supabase/tests/org_check.sql   (always rolled back)

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
  ('o_sec',    'o.sec@think-up.academy',    'O Secretary',  'secretary', null),
  ('o_ceo',    'o.ceo@think-up.academy',    'O CEO',        'ceo',       null),
  ('o_vp',     'o.vp@think-up.academy',     'O VP Tech',    'vp',        (select id from departments where name = 'Tech')),
  ('o_mentor', 'o.mentor@think-up.academy', 'O Mentor Tech','mentor',    (select id from departments where name = 'Tech')),
  ('o_mk',     'o.mk@think-up.academy',     'O Mentor MK',  'mentor',    (select id from departments where name = 'MK'));

-- =====================================================================
-- Secretary: CD meeting with minutes, 2 decisions, 2 follow-up tasks
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"o_sec","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'create CD meeting via create_meeting', 'ok', pg_temp.try($q$
    select create_meeting('cd', null, 'O CD weekly', now(), 'Minuta', array['o_sec','o_ceo','o_vp'],
      array['Decizia 1', '  ', 'Decizia 2'],
      '[{"title":"O follow-up Tech","assignee_id":"o_mentor","deadline":null},
        {"title":"O follow-up CEO","assignee_id":"o_ceo","deadline":null}]'::jsonb)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'blank decision lines skipped', '2', pg_temp.cnt($q$select 1 from decisions d join meetings m on m.id = d.meeting_id where m.title = 'O CD weekly'$q$)),
  ('secretary', 'follow-up tasks linked to meeting', '2', pg_temp.cnt($q$select 1 from tasks t join meetings m on m.id = t.meeting_id where m.title = 'O CD weekly'$q$)),
  ('secretary', 'CD follow-up goes to assignee dept', 'Tech', pg_temp.val($q$select d.name from tasks t join departments d on d.id = t.department_id where t.title = 'O follow-up Tech'$q$)),
  ('secretary', 'CD follow-up for CEO has no dept', 'null', pg_temp.val($q$select department_id::text from tasks where title = 'O follow-up CEO'$q$)),
  ('secretary', 'attendees stored', '3', pg_temp.val($q$select cardinality(attendees)::text from meetings where title = 'O CD weekly'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'atomic: bad assignee saves nothing', 'denied', pg_temp.try($q$
    select create_meeting('cd', null, 'O broken', now(), null, null, array['X'],
      '[{"title":"T","assignee_id":"nobody","deadline":null}]'::jsonb)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('secretary', 'atomic: no half meeting left', '0', pg_temp.cnt($q$select 1 from meetings where title = 'O broken'$q$)),
  ('secretary', 'spoofed meeting author', 'denied', pg_temp.try($q$insert into meetings (kind, title, held_at, author_id) values ('cd', 'O spoof', now(), 'o_ceo')$q$));
reset role;

-- =====================================================================
-- VP Tech: department meetings, decisions on CD meeting
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"o_vp","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'create Tech meeting with follow-up', 'ok', pg_temp.try($q$
    select create_meeting('department', (select id from departments where name = 'Tech'), 'O Tech weekly', now(), 'M', null, array['D'],
      '[{"title":"O tech follow-up","assignee_id":"o_mentor","deadline":"2026-12-31T21:59:59Z"}]'::jsonb)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'dept follow-up goes to meeting dept', 'Tech', pg_temp.val($q$select d.name from tasks t join departments d on d.id = t.department_id where t.title = 'O tech follow-up'$q$)),
  ('vp_tech', 'deadline kept', '2026-12-31 21:59:59+00', pg_temp.val($q$select (deadline at time zone 'UTC')::text || '+00' from tasks where title = 'O tech follow-up'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'create PN meeting', 'denied', pg_temp.try($q$
    select create_meeting('department', (select id from departments where name = 'PN'), 'O PN by tech', now(), null, null, null, null)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'add decision to CD meeting (tightened)', 'denied', pg_temp.try($q$insert into decisions (meeting_id, text, author_id) select id, 'X', 'o_vp' from meetings where title = 'O CD weekly'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'add decision to own dept meeting', 'ok', pg_temp.try($q$insert into decisions (meeting_id, text, author_id) select id, 'Later', 'o_vp' from meetings where title = 'O Tech weekly'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'spoofed decision author', 'denied', pg_temp.try($q$insert into decisions (meeting_id, text, author_id) select id, 'X', 'o_sec' from meetings where title = 'O Tech weekly'$q$)),
  ('vp_tech', 'sees CD decisions', '2', pg_temp.cnt($q$select 1 from decisions d join meetings m on m.id = d.meeting_id where m.title = 'O CD weekly'$q$));
reset role;

-- =====================================================================
-- Mentors: read rules
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"o_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'create meeting', 'denied', pg_temp.try($q$
    select create_meeting('department', (select id from departments where name = 'Tech'), 'O by mentor', now(), null, null, null, null)$q$)),
  ('mentor_tech', 'sees Tech decisions, not CD', '2', pg_temp.cnt($q$select 1 from decisions$q$)),
  ('mentor_tech', 'sees own CD follow-up task', '1', pg_temp.cnt($q$select 1 from tasks where title = 'O follow-up Tech'$q$));
reset role;

-- =====================================================================
-- Documents
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"o_vp","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'doc: department visibility without dept', 'denied', pg_temp.try($q$insert into documents (title, url, visibility, created_by) values ('O doc', 'https://drive.google.com/x', 'department', 'o_vp')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'doc: Tech department doc', 'ok', pg_temp.try($q$insert into documents (title, url, department_id, visibility, created_by) values ('O tech doc', 'https://drive.google.com/x', (select id from departments where name = 'Tech'), 'department', 'o_vp')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'doc: visible to all', 'ok', pg_temp.try($q$insert into documents (title, url, visibility, created_by) values ('O all doc', 'https://drive.google.com/y', 'all', 'o_vp')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'doc: fix own link', 'ok', pg_temp.try($q$update documents set url = 'https://drive.google.com/z' where title = 'O all doc'$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"o_mk","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_mk', 'doc: sees "all" doc, not Tech doc', '1', pg_temp.cnt($q$select 1 from documents where title like 'O %'$q$)),
  ('mentor_mk', 'doc: create', 'denied', pg_temp.try($q$insert into documents (title, url, visibility, created_by) values ('O x', 'https://drive.google.com/x', 'all', 'o_mk')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_mk', 'doc: archive someone else''s', 'denied', pg_temp.try($q$update documents set archived = true where title = 'O all doc'$q$));
reset role;

-- =====================================================================
-- Announcements
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"o_vp","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'announcement as self', 'ok', pg_temp.try($q$insert into announcements (title, author_id) values ('O ann', 'o_vp')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'announcement spoofed author', 'denied', pg_temp.try($q$insert into announcements (title, author_id) values ('O spoof', 'o_ceo')$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"o_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'announcement create', 'denied', pg_temp.try($q$insert into announcements (title, author_id) values ('O m', 'o_mentor')$q$)),
  ('mentor_tech', 'announcement read', '1', pg_temp.cnt($q$select 1 from announcements where title like 'O %'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_tech', 'archive someone else''s announcement', 'denied', pg_temp.try($q$update announcements set archived = true where title = 'O ann'$q$));
reset role;
