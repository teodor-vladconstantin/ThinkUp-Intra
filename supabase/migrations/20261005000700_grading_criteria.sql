-- Grading: 4 criteria graded 1-5 (max 20 per challenge) + yearly bonus points per student.
-- Existing grades get a neutral 3 on every criterion (score 12); regrade if they were real.

alter table submissions
  add column innovation int not null default 3 check (innovation between 1 and 5),
  add column impact int not null default 3 check (impact between 1 and 5),
  add column feedback_score int not null default 3 check (feedback_score between 1 and 5),
  add column efficiency int not null default 3 check (efficiency between 1 and 5);
alter table submissions
  alter column innovation drop default, alter column impact drop default,
  alter column feedback_score drop default, alter column efficiency drop default;
alter table submissions drop column score;
alter table submissions add column score int generated always as (innovation + impact + feedback_score + efficiency) stored;

alter table challenges drop column max_score;
revoke update on challenges from authenticated;
grant update (name, description, deadline, archived) on challenges to authenticated;

create or replace function submissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_access(new.student_id) then
    raise exception 'student is not on the platform';
  end if;
  new.graded_at := now();
  return new;
end $$;

drop function grade_project(uuid, uuid, int, text);
create function grade_project(p_project uuid, p_challenge uuid, p_innovation int, p_impact int,
                              p_feedback_score int, p_efficiency int, p_feedback text)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  insert into submissions (challenge_id, student_id, project_id, innovation, impact, feedback_score, efficiency, feedback, graded_by)
  select p_challenge, m.profile_id, p_project, p_innovation, p_impact, p_feedback_score, p_efficiency, p_feedback, auth.jwt()->>'sub'
  from project_members m where m.project_id = p_project
  on conflict (challenge_id, student_id) do update
    set innovation = excluded.innovation, impact = excluded.impact,
        feedback_score = excluded.feedback_score, efficiency = excluded.efficiency,
        feedback = excluded.feedback, graded_by = excluded.graded_by, project_id = excluded.project_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Bonus points (e.g. posters): per student, counted in the school year of awarded_at.
create table bonus_points (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references profiles(clerk_id),
  points int not null check (points > 0),
  reason text not null,
  awarded_by text not null references profiles(clerk_id),
  awarded_at timestamptz not null default now()
);
create index on bonus_points (student_id);
revoke update on bonus_points from authenticated, anon;
alter table bonus_points enable row level security;
create policy bonus_read on bonus_points for select using (
  (student_id = auth.jwt()->>'sub' and can_access_platform()) or is_pn_dept());
create policy bonus_ins on bonus_points for insert with check (
  is_pn_dept() and awarded_by = auth.jwt()->>'sub' and has_platform_access(student_id));
