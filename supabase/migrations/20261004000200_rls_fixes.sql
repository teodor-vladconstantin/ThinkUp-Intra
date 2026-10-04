-- RLS fixes found while reviewing the v1 schema.

-- ---------------------------------------------------------------------
-- 1. Deactivated users must lose access immediately.
-- Some policies compared auth.jwt()->>'sub' directly, which skips the
-- is_active check inside the helpers. "my_role() is not null" is true only
-- for an active profile, so we add it to every such policy.
-- ---------------------------------------------------------------------
drop policy tasks_read on tasks;
create policy tasks_read on tasks for select using (
  my_role() is not null
  and (
    is_cd()
    or assignee_id = auth.jwt()->>'sub'
    or creator_id  = auth.jwt()->>'sub'
    or department_id = my_dept()
    or requesting_department_id = my_dept()));

drop policy tasks_update on tasks;
create policy tasks_update on tasks for update using (
  my_role() is not null
  and (
    is_superadmin()
    or my_role() in ('ceo','president')
    or creator_id  = auth.jwt()->>'sub'
    or assignee_id = auth.jwt()->>'sub'
    or (my_role() = 'vp' and (department_id = my_dept() or requesting_department_id = my_dept()))));

drop policy comments_insert on task_comments;
create policy comments_insert on task_comments for insert with check (
  my_role() is not null
  and author_id = auth.jwt()->>'sub'
  and exists (select 1 from tasks t where t.id = task_id));

drop policy ann_update on announcements;
create policy ann_update on announcements for update using (
  my_role() is not null
  and (is_superadmin() or author_id = auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------
-- 2. Membership of the PN department is decided by the department itself,
-- not by the can_access_pn flag. Opening PN (view) access to Tech or MK must
-- not give them ambassador contacts, school writes or county moves.
-- can_access_pn() keeps using the flag; only is_pn_dept() changes.
-- ---------------------------------------------------------------------
create or replace function is_pn_dept() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    is_superadmin()
    or exists (select 1 from departments d where d.id = my_dept() and d.name = 'PN'),
    false)
$$;

-- ---------------------------------------------------------------------
-- 3. Invitations: same department rule as profiles (otherwise profile
-- creation fails at first sign-in), and the inviter is always the caller.
-- ---------------------------------------------------------------------
alter table invitations add constraint inv_dept_required
  check (role in ('ceo','president','secretary') or department_id is not null);

drop policy inv_insert on invitations;
create policy inv_insert on invitations for insert with check (
  invited_by = auth.jwt()->>'sub'
  and (
    is_superadmin()
    or my_role() in ('ceo','president')
    or (my_role() = 'vp' and department_id = my_dept() and role = 'mentor')));
