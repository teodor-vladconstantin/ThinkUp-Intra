-- Activity log behind the weekly streak. Written only by the triggers below (as the signed-in user),
-- never directly: nobody can fake or erase an event.

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(clerk_id),
  kind text not null check (kind in ('goal_progress', 'material', 'photo')),
  project_id uuid not null references projects(id),
  created_at timestamptz not null default now()
);
create index on activity_events (profile_id, created_at);
revoke insert, update, delete on activity_events from authenticated, anon;
alter table activity_events enable row level security;
create policy activity_read on activity_events for select using (
  (profile_id = auth.jwt()->>'sub' and can_access_platform()) or is_pn_dept());

-- One row per distinct Monday (Romanian time) with activity.
create view activity_weeks with (security_invoker = true) as
  select distinct profile_id, date_trunc('week', created_at at time zone 'Europe/Bucharest')::date as week
  from activity_events;
grant select on activity_weeks to authenticated;

-- No JWT (service role, seeds, migrations) = no actor = no event.
create function log_platform_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text := auth.jwt()->>'sub'; pid uuid; k text;
begin
  if actor is null then return new; end if;
  if tg_table_name = 'goals' then pid := new.project_id; k := 'goal_progress';
  elsif tg_table_name = 'materials' then pid := new.project_id; k := 'material';
  elsif tg_table_name = 'material_files' then select project_id into pid from materials where id = new.material_id; k := 'material';
  else pid := new.project_id; k := 'photo';
  end if;
  insert into activity_events (profile_id, kind, project_id) values (actor, k, pid);
  return new;
end $$;

create trigger goals_activity after update of progress on goals
  for each row when (old.progress is distinct from new.progress) execute function log_platform_activity();
create trigger materials_activity after insert on materials for each row execute function log_platform_activity();
create trigger material_files_activity after insert on material_files for each row execute function log_platform_activity();
create trigger project_photos_activity after insert on project_photos for each row execute function log_platform_activity();
