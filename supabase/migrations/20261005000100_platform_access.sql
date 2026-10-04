-- Platform step 1b: who sees what once ambassador students have accounts.
--
-- Three worlds, three gates:
--   intranet  (tasks, meetings, documents, announcements) -> is_staff()
--   PN        (zones, counties, schools, ambassadors)      -> can_access_pn() / is_pn_dept(), unchanged
--   platform  (projects etc., next migration)              -> can_access_platform(); mentoring = is_pn_dept()
--
-- "Ambassador" is NOT a role: a Tech mentor can also be an ambassador student.
-- It is a row in ambassadors pointing at the profile, so the link lives on the PN
-- side and only people with PN access can see who is an ambassador, or where from.
-- Never add school / county / zone columns to profiles.

-- ---------------------------------------------------------------------
-- 1. Students have no department (and every other rule stays as it was).
-- ---------------------------------------------------------------------
alter table profiles drop constraint dept_required;
alter table profiles add constraint dept_required check (
  (role in ('ceo','president','secretary','student') or department_id is not null)
  and (role <> 'student' or department_id is null));

alter table invitations drop constraint inv_dept_required;
alter table invitations add constraint inv_dept_required check (
  (role in ('ceo','president','secretary','student') or department_id is not null)
  and (role <> 'student' or department_id is null));

-- ---------------------------------------------------------------------
-- 2. Ambassador <-> account link (set by PN through amb_upd, like the rest of the row).
-- platform_user_id pointed at the old platform; it goes away when the PN form switches.
-- ---------------------------------------------------------------------
alter table ambassadors add column profile_id text unique references profiles(clerk_id);

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------
-- Active profile that is not a student. Replaces "my_role() is not null" in intranet policies.
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() <> 'student', false)
$$;

-- Only answers "am I an active ambassador"; never reveals anything about other rows.
create function is_ambassador() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() is not null and exists (
    select 1 from ambassadors a where a.profile_id = (auth.jwt()->>'sub') and a.active), false)
$$;

-- Who may enter the platform area: anyone with a PN tangent, or an ambassador.
create function can_access_platform() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(can_access_pn() or is_ambassador(), false)
$$;

-- ---------------------------------------------------------------------
-- 4. Intranet policies: staff only.
-- ---------------------------------------------------------------------
drop policy dept_read on departments;
create policy dept_read on departments for select using (is_staff());

-- Students are ambassadors-to-be: only people with PN access may list them.
-- Everyone (student included) reads their own row.
drop policy profiles_read on profiles;
create policy profiles_read on profiles for select using (
  (clerk_id = auth.jwt()->>'sub' and my_role() is not null)
  or (is_staff() and (role <> 'student' or can_access_pn())));

drop policy ann_read on announcements;
create policy ann_read on announcements for select using (is_staff());

drop policy ann_update on announcements;
create policy ann_update on announcements for update using (
  is_staff() and (is_superadmin() or author_id = auth.jwt()->>'sub'));

-- Also closes an old gap: visibility = 'all' had no active-profile check at all.
drop policy docs_read on documents;
create policy docs_read on documents for select using (
  is_staff()
  and (
    is_superadmin()
    or visibility = 'all'
    or (visibility = 'cd' and is_cd())
    or (visibility = 'department' and department_id = my_dept())));

drop policy docs_update on documents;
create policy docs_update on documents for update using (
  is_staff() and (is_superadmin() or created_by = auth.jwt()->>'sub'));

drop policy tasks_read on tasks;
create policy tasks_read on tasks for select using (
  is_staff()
  and (
    is_cd()
    or assignee_id = auth.jwt()->>'sub'
    or creator_id  = auth.jwt()->>'sub'
    or department_id = my_dept()
    or requesting_department_id = my_dept()));

drop policy tasks_update on tasks;
create policy tasks_update on tasks for update using (
  is_staff()
  and (
    is_superadmin()
    or my_role() in ('ceo','president')
    or creator_id  = auth.jwt()->>'sub'
    or assignee_id = auth.jwt()->>'sub'
    or (my_role() = 'vp' and (department_id = my_dept() or requesting_department_id = my_dept()))));

drop policy comments_insert on task_comments;
create policy comments_insert on task_comments for insert with check (
  is_staff()
  and author_id = auth.jwt()->>'sub'
  and exists (select 1 from tasks t where t.id = task_id));

-- ---------------------------------------------------------------------
-- 5. Inviting and managing students: the PN department (plus CEO/President/superadmin).
-- ---------------------------------------------------------------------
drop policy inv_insert on invitations;
create policy inv_insert on invitations for insert with check (
  invited_by = auth.jwt()->>'sub'
  and (
    is_superadmin()
    or my_role() in ('ceo','president')
    or (my_role() = 'vp' and department_id = my_dept() and role = 'mentor')
    or (is_pn_dept() and role = 'student')));

create or replace function can_manage_user(p_target text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select my_role() is not null
       and t.clerk_id <> (auth.jwt()->>'sub')
       and (not t.is_superadmin or is_superadmin())
       and (is_superadmin()
            or my_role() in ('ceo', 'president')
            or (my_role() = 'vp' and t.role = 'mentor' and t.department_id = my_dept())
            or (is_pn_dept() and t.role = 'student'))
    from profiles t
    where t.clerk_id = p_target), false)
$$;

-- ---------------------------------------------------------------------
-- 6. Tasks are staff work: never assigned to a student (covers create_meeting too).
-- Same body as 20261004000300_tasks_guard.sql plus the assignee check.
-- ---------------------------------------------------------------------
create or replace function tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and exists (select 1 from profiles p where p.clerk_id = new.assignee_id and p.role = 'student') then
    raise exception 'tasks cannot be assigned to students';
  end if;

  if tg_op = 'UPDATE' then
    if new.creator_id is distinct from old.creator_id then
      raise exception 'creator_id cannot change';
    end if;

    -- Moving a task between departments is a CD decision (PRD: CD creates across departments).
    -- Requests without a Clerk user (table owner, secret-key server code) are not limited here.
    if (new.department_id is distinct from old.department_id
        or new.requesting_department_id is distinct from old.requesting_department_id)
       and auth.jwt()->>'sub' is not null
       and not is_cd() then
      raise exception 'only CD members can move a task between departments';
    end if;
  end if;

  -- PRD 5.1: setting status to done sets completed_at; reopening clears it.
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end $$;
