-- Platform step 2: the ambassadors platform (projects, challenges, grading, Open School).
-- Rebuilt from the thinkup feature list, not its storage: relational, RLS on every table.
--
-- Gates (from 20261005000100_platform_access.sql):
--   read anything on the platform  -> can_access_platform()   (ambassadors + PN tangent)
--   mentoring (grade, warn, feedback, challenges, Open School, puzzle) -> is_pn_dept()
--   edit a project and its content -> is_project_member(project_id)
-- Tech/MK staff who are not ambassadors pass none of these: 0 rows everywhere.
--
-- Files (photos, materials, Open School) store a storage_path; buckets come in step 3.

-- ---------------------------------------------------------------------
-- 1. Who is on the platform (for any profile, not only the caller).
-- Same rule as can_access_platform(), keep the two in sync.
-- ---------------------------------------------------------------------
create function has_platform_access(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_active and (
      p.is_superadmin
      or p.role in ('ceo','president','secretary')
      or coalesce(d.can_access_pn, false)
      or exists (select 1 from ambassadors a where a.profile_id = p.clerk_id and a.active))
    from profiles p left join departments d on d.id = p.department_id
    where p.clerk_id = p_id), false)
$$;

-- Names (and the mentor badge) of platform people, for platform users only.
-- A view on purpose: profiles_read hides students from staff without PN access, and
-- students see only their own profile row. This exposes no email, school or department.
create view platform_people as
select p.clerk_id, p.full_name, (p.is_superadmin or coalesce(d.name = 'PN', false)) as is_mentor
from profiles p left join departments d on d.id = p.department_id
where can_access_platform() and has_platform_access(p.clerk_id);
revoke all on platform_people from anon;
grant select on platform_people to authenticated;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table platform_profiles (                    -- what the old Users table had besides identity
  profile_id text primary key references profiles(clerk_id),
  bio text,
  social jsonb not null default '{}',               -- {"github": "...", "linkedin": "..."}
  avatar_path text,
  cover_path text,
  updated_at timestamptz not null default now()
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  deadline timestamptz,
  max_score int not null default 100 check (max_score > 0),
  created_by text not null references profiles(clerk_id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by text not null references profiles(clerk_id),
  challenge_id uuid references challenges(id),
  thumbnail_path text,
  accept_reviews boolean not null default true,
  archived boolean not null default false,          -- no deletes, like the intranet
  created_at timestamptz not null default now()
);

create table project_members (                      -- replaces adminList; every member can edit
  project_id uuid not null references projects(id),
  profile_id text not null references profiles(clerk_id),
  added_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index on project_members (profile_id);

create table goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null,
  description text,
  progress smallint not null default 0 check (progress between 0 and 100),
  deadline date,
  created_at timestamptz not null default now()
);
create index on goals (project_id);

create table materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null,
  description text,
  position int not null default 0,                  -- order inside the project (move up/down)
  created_by text references profiles(clerk_id),
  created_at timestamptz not null default now()
);
create index on materials (project_id, position);

create table material_files (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  file_type text,
  created_at timestamptz not null default now()
);
create index on material_files (material_id);

create table project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index on project_photos (project_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  author_id text not null references profiles(clerk_id),
  body text,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (project_id, author_id)
);

create table mentor_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  mentor_id text not null references profiles(clerk_id),
  body text not null,
  created_at timestamptz not null default now()
);
create index on mentor_feedback (project_id);

-- One grade per student per challenge; grading a project writes one row per member.
create table submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id),
  student_id text not null references profiles(clerk_id),
  project_id uuid references projects(id),
  score int not null check (score >= 0),
  feedback text,
  graded_by text not null references profiles(clerk_id),
  graded_at timestamptz not null default now(),
  unique (challenge_id, student_id)
);
create index on submissions (student_id);

create table warnings (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references profiles(clerk_id),
  issued_by text not null references profiles(clerk_id),
  body text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on warnings (student_id);

create table personal_objectives (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references profiles(clerk_id),
  name text not null,
  description text,
  progress smallint not null default 0 check (progress between 0 and 100),
  deadline date,
  created_at timestamptz not null default now()
);
create index on personal_objectives (owner_id);

create table open_school_files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  storage_path text not null unique,
  file_type text,
  views int not null default 0,
  uploaded_by text references profiles(clerk_id),
  created_at timestamptz not null default now()
);

create table open_school_favorites (
  profile_id text not null references profiles(clerk_id),
  file_id uuid not null references open_school_files(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, file_id)
);

create table puzzle_pieces (
  profile_id text not null references profiles(clerk_id),
  piece smallint not null check (piece > 0),
  given_by text not null references profiles(clerk_id),
  given_at timestamptz not null default now(),
  primary key (profile_id, piece)
);

-- ---------------------------------------------------------------------
-- 3. Helpers and guards
-- ---------------------------------------------------------------------
create function is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() is not null and exists (
    select 1 from project_members m where m.project_id = p_project and m.profile_id = (auth.jwt()->>'sub')), false)
$$;

-- The creator is always a member (runs as owner: project_members has no self-insert path).
create function add_project_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, profile_id) values (new.id, new.created_by);
  return new;
end $$;
create trigger add_project_creator after insert on projects
  for each row execute function add_project_creator();

-- Score within the challenge's max; the graded student must be on the platform.
create function submissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.score > (select max_score from challenges where id = new.challenge_id) then
    raise exception 'score above max_score';
  end if;
  if not has_platform_access(new.student_id) then
    raise exception 'student is not on the platform';
  end if;
  new.graded_at := now();
  return new;
end $$;
create trigger submissions_guard before insert or update on submissions
  for each row execute function submissions_guard();

-- Grade every member of a project for a challenge, in one transaction.
-- security invoker: each row still passes submissions RLS (PN only).
create function grade_project(p_project uuid, p_challenge uuid, p_score int, p_feedback text)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  insert into submissions (challenge_id, student_id, project_id, score, feedback, graded_by)
  select p_challenge, m.profile_id, p_project, p_score, p_feedback, auth.jwt()->>'sub'
  from project_members m where m.project_id = p_project
  on conflict (challenge_id, student_id) do update
    set score = excluded.score, feedback = excluded.feedback,
        graded_by = excluded.graded_by, project_id = excluded.project_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Counting a view must not need update rights on the file row.
create function open_school_view(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update open_school_files set views = views + 1 where id = p_id and can_access_platform()
$$;

-- ---------------------------------------------------------------------
-- 4. Column-level update rights: ownership columns never change from the client.
-- ---------------------------------------------------------------------
revoke update on projects, reviews, mentor_feedback, challenges, warnings, open_school_files from authenticated, anon;
grant update (name, description, challenge_id, thumbnail_path, accept_reviews, archived) on projects to authenticated;
grant update (body, rating) on reviews to authenticated;
grant update (body) on mentor_feedback to authenticated;
grant update (name, description, deadline, max_score, archived) on challenges to authenticated;
grant update (archived) on warnings to authenticated;
grant update (name, description) on open_school_files to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table platform_profiles     enable row level security;
alter table challenges            enable row level security;
alter table projects              enable row level security;
alter table project_members       enable row level security;
alter table goals                 enable row level security;
alter table materials             enable row level security;
alter table material_files        enable row level security;
alter table project_photos        enable row level security;
alter table reviews               enable row level security;
alter table mentor_feedback       enable row level security;
alter table submissions           enable row level security;
alter table warnings              enable row level security;
alter table personal_objectives   enable row level security;
alter table open_school_files     enable row level security;
alter table open_school_favorites enable row level security;
alter table puzzle_pieces         enable row level security;

-- profiles: own row only
create policy pprof_read   on platform_profiles for select using (can_access_platform());
create policy pprof_insert on platform_profiles for insert with check (can_access_platform() and profile_id = auth.jwt()->>'sub');
create policy pprof_update on platform_profiles for update
  using (can_access_platform() and profile_id = auth.jwt()->>'sub')
  with check (profile_id = auth.jwt()->>'sub');

-- challenges: PN creates; its author edits/archives
create policy ch_read   on challenges for select using (can_access_platform());
create policy ch_insert on challenges for insert with check (is_pn_dept() and created_by = auth.jwt()->>'sub');
create policy ch_update on challenges for update using (is_pn_dept() and (created_by = auth.jwt()->>'sub' or is_superadmin()));

-- projects: everyone on the platform sees all of them (shared gallery); members edit
create policy proj_read   on projects for select using (can_access_platform());
create policy proj_insert on projects for insert with check (can_access_platform() and created_by = auth.jwt()->>'sub');
create policy proj_update on projects for update using (can_access_platform() and is_project_member(id));

-- members: members add platform people; nobody removes the creator
create policy pm_read   on project_members for select using (can_access_platform());
create policy pm_insert on project_members for insert with check (
  can_access_platform() and is_project_member(project_id) and has_platform_access(profile_id));
create policy pm_delete on project_members for delete using (
  can_access_platform() and is_project_member(project_id)
  and profile_id <> (select p.created_by from projects p where p.id = project_id));

-- project content: read by the platform, written by members (also on the NEW row,
-- so content cannot be moved into someone else's project)
create policy goals_read on goals for select using (can_access_platform());
create policy goals_ins  on goals for insert with check (is_project_member(project_id));
create policy goals_upd  on goals for update using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy goals_del  on goals for delete using (is_project_member(project_id));

create policy mat_read on materials for select using (can_access_platform());
create policy mat_ins  on materials for insert with check (is_project_member(project_id) and created_by = auth.jwt()->>'sub');
create policy mat_upd  on materials for update using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy mat_del  on materials for delete using (is_project_member(project_id));

create policy mf_read on material_files for select using (can_access_platform());
create policy mf_ins  on material_files for insert with check (
  exists (select 1 from materials m where m.id = material_id and is_project_member(m.project_id)));
create policy mf_del  on material_files for delete using (
  exists (select 1 from materials m where m.id = material_id and is_project_member(m.project_id)));

create policy photo_read on project_photos for select using (can_access_platform());
create policy photo_ins  on project_photos for insert with check (is_project_member(project_id));
create policy photo_del  on project_photos for delete using (is_project_member(project_id));

-- reviews: not on your own project, only where the project accepts them, one per person
create policy rev_read on reviews for select using (can_access_platform());
create policy rev_ins  on reviews for insert with check (
  can_access_platform()
  and author_id = auth.jwt()->>'sub'
  and not is_project_member(project_id)
  and exists (select 1 from projects p where p.id = project_id and p.accept_reviews and not p.archived));
create policy rev_upd  on reviews for update using (author_id = auth.jwt()->>'sub' and can_access_platform());
create policy rev_del  on reviews for delete using (author_id = auth.jwt()->>'sub' and can_access_platform());

-- mentor feedback: PN writes; the author edits/deletes their own
create policy fb_read on mentor_feedback for select using (can_access_platform());
create policy fb_ins  on mentor_feedback for insert with check (is_pn_dept() and mentor_id = auth.jwt()->>'sub');
create policy fb_upd  on mentor_feedback for update using (is_pn_dept() and mentor_id = auth.jwt()->>'sub');
create policy fb_del  on mentor_feedback for delete using (is_pn_dept() and mentor_id = auth.jwt()->>'sub');

-- grades: the student sees their own, PN sees and writes all
create policy sub_read on submissions for select using (
  (student_id = auth.jwt()->>'sub' and can_access_platform()) or is_pn_dept());
create policy sub_ins  on submissions for insert with check (is_pn_dept() and graded_by = auth.jwt()->>'sub');
create policy sub_upd  on submissions for update using (is_pn_dept()) with check (graded_by = auth.jwt()->>'sub');

-- warnings: same visibility as grades; archived by the issuer or a VP PN
create policy warn_read on warnings for select using (
  (student_id = auth.jwt()->>'sub' and can_access_platform()) or is_pn_dept());
create policy warn_ins  on warnings for insert with check (
  is_pn_dept() and issued_by = auth.jwt()->>'sub' and has_platform_access(student_id));
create policy warn_upd  on warnings for update using (
  is_pn_dept() and (issued_by = auth.jwt()->>'sub' or my_role() = 'vp' or is_superadmin()));

-- personal objectives: the owner manages them; PN mentors read them
create policy po_read on personal_objectives for select using (
  (owner_id = auth.jwt()->>'sub' and can_access_platform()) or is_pn_dept());
create policy po_ins  on personal_objectives for insert with check (can_access_platform() and owner_id = auth.jwt()->>'sub');
create policy po_upd  on personal_objectives for update
  using (can_access_platform() and owner_id = auth.jwt()->>'sub')
  with check (owner_id = auth.jwt()->>'sub');
create policy po_del  on personal_objectives for delete using (can_access_platform() and owner_id = auth.jwt()->>'sub');

-- Open School: read by the platform, managed by PN
create policy os_read on open_school_files for select using (can_access_platform());
create policy os_ins  on open_school_files for insert with check (is_pn_dept() and uploaded_by = auth.jwt()->>'sub');
create policy os_upd  on open_school_files for update using (is_pn_dept());
create policy os_del  on open_school_files for delete using (is_pn_dept());

create policy osf_read on open_school_favorites for select using (can_access_platform() and profile_id = auth.jwt()->>'sub');
create policy osf_ins  on open_school_favorites for insert with check (can_access_platform() and profile_id = auth.jwt()->>'sub');
create policy osf_del  on open_school_favorites for delete using (profile_id = auth.jwt()->>'sub');

-- puzzle: visible on the platform, given by PN
create policy pz_read on puzzle_pieces for select using (can_access_platform());
create policy pz_ins  on puzzle_pieces for insert with check (
  is_pn_dept() and given_by = auth.jwt()->>'sub' and has_platform_access(profile_id));
