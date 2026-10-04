-- Rules on task rows that RLS cannot express.
--
-- RLS decides WHO may update a task, but it only sees the new row: it cannot tell
-- "status changed" from "department changed". tasks_update also has no WITH CHECK,
-- so an assignee could otherwise move a task to any department or rewrite its creator.
-- A BEFORE trigger sees both OLD and NEW, so these rules live here.

create function tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

create trigger tasks_guard before insert or update on tasks
  for each row execute function tasks_guard();
