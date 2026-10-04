-- Tasks: guard trigger, overdue view, comments, history.
-- Run with: bun run rls:check supabase/tests/tasks_check.sql   (always rolled back)

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
  ('t_mentor', 't.mentor@think-up.academy', 'T Mentor', 'mentor', (select id from departments where name = 'Tech')),
  ('t_vp',     't.vp@think-up.academy',     'T VP',     'vp',     (select id from departments where name = 'Tech'));

insert into tasks (id, title, creator_id, assignee_id, department_id, deadline, status) values
  ('10000000-0000-0000-0000-000000000001', 'T assigned',  't_vp', 't_mentor', (select id from departments where name = 'Tech'), now() + interval '10 days', 'todo'),
  ('10000000-0000-0000-0000-000000000002', 'T overdue',   't_vp', 't_mentor', (select id from departments where name = 'Tech'), now() - interval '1 hour',  'todo'),
  ('10000000-0000-0000-0000-000000000003', 'T due soon',  't_vp', 't_mentor', (select id from departments where name = 'Tech'), now() + interval '24 hours', 'in_progress'),
  ('10000000-0000-0000-0000-000000000004', 'T done late', 't_vp', 't_mentor', (select id from departments where name = 'Tech'), now() - interval '2 days',  'done'),
  ('10000000-0000-0000-0000-000000000005', 'T pn',        't_vp', null,       (select id from departments where name = 'PN'),   null,                       'todo');

-- ---------- overdue view (owner, no RLS) ----------
insert into rls_results (persona, check_name, expected, actual) values
  ('view', 'deadline passed -> overdue',          'overdue',  pg_temp.val($q$select alert from tasks_with_alert where id = '10000000-0000-0000-0000-000000000002'$q$)),
  ('view', 'deadline in 24h -> due_soon',         'due_soon', pg_temp.val($q$select alert from tasks_with_alert where id = '10000000-0000-0000-0000-000000000003'$q$)),
  ('view', 'deadline in 10 days -> no alert',     'null',     pg_temp.val($q$select alert from tasks_with_alert where id = '10000000-0000-0000-0000-000000000001'$q$)),
  ('view', 'done task never alerts',              'null',     pg_temp.val($q$select alert from tasks_with_alert where id = '10000000-0000-0000-0000-000000000004'$q$)),
  ('view', 'inserted as done -> completed_at set', 'set',     pg_temp.val($q$select case when completed_at is not null then 'set' end from tasks where id = '10000000-0000-0000-0000-000000000004'$q$));

-- ---------- mentor (assignee) ----------
select set_config('request.jwt.claims', '{"sub":"t_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'set status done', 'ok', pg_temp.try($q$update tasks set status = 'done' where id = '10000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'done -> completed_at set', 'set', pg_temp.val($q$select case when completed_at is not null then 'set' end from tasks where id = '10000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'reopen', 'ok', pg_temp.try($q$update tasks set status = 'in_progress' where id = '10000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'reopen -> completed_at cleared', 'null', pg_temp.val($q$select completed_at::text from tasks where id = '10000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'move task to PN', 'denied', pg_temp.try($q$update tasks set department_id = (select id from departments where name = 'PN') where id = '10000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'rewrite creator', 'denied', pg_temp.try($q$update tasks set creator_id = 't_mentor' where id = '10000000-0000-0000-0000-000000000001'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'archive assigned task', 'ok', pg_temp.try($q$update tasks set archived = true where id = '10000000-0000-0000-0000-000000000003'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'delete a task', 'denied', pg_temp.try($q$delete from tasks where id = '10000000-0000-0000-0000-000000000002'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'comment on visible task', 'ok', pg_temp.try($q$insert into task_comments (task_id, author_id, body) values ('10000000-0000-0000-0000-000000000001', 't_mentor', 'W')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'comment on PN task (not visible)', 'denied', pg_temp.try($q$insert into task_comments (task_id, author_id, body) values ('10000000-0000-0000-0000-000000000005', 't_mentor', 'W')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'comment as someone else', 'denied', pg_temp.try($q$insert into task_comments (task_id, author_id, body) values ('10000000-0000-0000-0000-000000000001', 't_vp', 'W')$q$)),
  ('mentor', 'history of visible task', 'yes', pg_temp.val($q$select case when count(*) > 0 then 'yes' end from activity_log where entity = 'tasks' and entity_id = '10000000-0000-0000-0000-000000000001'$q$)),
  ('mentor', 'history of PN task hidden', '0', pg_temp.cnt($q$select 1 from activity_log where entity = 'tasks' and entity_id = '10000000-0000-0000-0000-000000000005'$q$));
reset role;

-- ---------- VP Tech (CD) ----------
select set_config('request.jwt.claims', '{"sub":"t_vp","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'move Tech task to PN, requested by Tech', 'ok', pg_temp.try($q$update tasks set department_id = (select id from departments where name = 'PN'), requesting_department_id = (select id from departments where name = 'Tech') where id = '10000000-0000-0000-0000-000000000002'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'rewrite creator', 'denied', pg_temp.try($q$update tasks set creator_id = 't_mentor' where id = '10000000-0000-0000-0000-000000000002'$q$));
reset role;

-- ---------- mentor again: moved task is still visible via requesting department ----------
select set_config('request.jwt.claims', '{"sub":"t_mentor","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor', 'cross-dept task still visible (assignee + requesting dept)', '1', pg_temp.cnt($q$select 1 from tasks where id = '10000000-0000-0000-0000-000000000002'$q$));
reset role;
