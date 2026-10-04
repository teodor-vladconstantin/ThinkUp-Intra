-- Phase 3: meetings, decisions, documents, announcements.

-- ---------------------------------------------------------------------
-- 1. Authors cannot be spoofed (same fix as invitations.invited_by).
-- ---------------------------------------------------------------------
drop policy meetings_write on meetings;
create policy meetings_write on meetings for insert with check (
  author_id = auth.jwt()->>'sub'
  and (
    is_superadmin()
    or (kind = 'cd' and my_role() = 'secretary')
    or (kind = 'department' and my_role() = 'vp' and department_id = my_dept())));

-- Decisions: only the people who write that meeting's minutes (PRD: VP or Secretary).
-- The old policy let any VP who can SEE a CD meeting add decisions to it.
drop policy decisions_write on decisions;
create policy decisions_write on decisions for insert with check (
  author_id = auth.jwt()->>'sub'
  and exists (
    select 1 from meetings m
    where m.id = meeting_id
      and (
        is_superadmin()
        or (m.kind = 'cd' and my_role() = 'secretary')
        or (m.kind = 'department' and my_role() = 'vp' and m.department_id = my_dept()))));

drop policy ann_write on announcements;
create policy ann_write on announcements for insert with check (
  author_id = auth.jwt()->>'sub'
  and (is_superadmin() or my_role() in ('ceo','president','vp')));

-- ---------------------------------------------------------------------
-- 2. Meeting attendees (the minutes template: attendees, decisions, follow-ups).
-- Clerk ids of the people present; a snapshot, so no foreign key per element.
-- ---------------------------------------------------------------------
alter table meetings add column attendees text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 3. Documents: archive instead of delete, and fix wrong links.
-- ---------------------------------------------------------------------
alter table documents add column archived boolean not null default false;
alter table documents add constraint doc_dept_required
  check (visibility <> 'department' or department_id is not null);

create policy docs_update on documents for update using (
  my_role() is not null
  and (is_superadmin() or created_by = auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------
-- 4. Minutes + decisions + follow-up tasks in ONE transaction.
-- security invoker: it runs as the caller, so every insert still passes RLS.
-- If any part fails (RLS, bad assignee), nothing is saved.
--
-- p_tasks: [{ "title": "...", "assignee_id": "user_..." | null, "deadline": "<ISO UTC>" | null }]
-- Follow-up tasks of a department meeting belong to that department; tasks of a
-- CD meeting belong to the assignee's department (null for CEO/President/Secretary).
-- ---------------------------------------------------------------------
create function create_meeting(
  p_kind meeting_kind,
  p_department_id int,
  p_title text,
  p_held_at timestamptz,
  p_minutes text,
  p_attendees text[],
  p_decisions text[],
  p_tasks jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_me text := auth.jwt()->>'sub';
  v_id uuid;
  v_task jsonb;
  v_dept int;
begin
  insert into meetings (kind, department_id, title, held_at, minutes, attendees, author_id)
  values (p_kind, p_department_id, p_title, p_held_at, p_minutes, coalesce(p_attendees, '{}'), v_me)
  returning id into v_id;

  insert into decisions (meeting_id, text, author_id, decided_at)
  select v_id, btrim(d), v_me, (p_held_at at time zone 'Europe/Bucharest')::date
  from unnest(coalesce(p_decisions, '{}')) as d
  where btrim(d) <> '';

  for v_task in select * from jsonb_array_elements(coalesce(p_tasks, '[]')) loop
    if p_kind = 'department' then
      v_dept := p_department_id;
    else
      select department_id into v_dept from profiles where clerk_id = v_task->>'assignee_id';
    end if;

    insert into tasks (title, assignee_id, deadline, creator_id, department_id, meeting_id)
    values (
      btrim(v_task->>'title'),
      nullif(v_task->>'assignee_id', ''),
      (v_task->>'deadline')::timestamptz,
      v_me,
      v_dept,
      v_id);
  end loop;

  return v_id;
end $$;
