-- Structured replacement for the Ambassador Student Sheet PDF uploaded to project materials.

create table project_student_sheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  student_id text not null references profiles(clerk_id),
  student_name text not null,
  school_name text not null,
  zone_county text not null,
  challenge_title text not null,
  activity_date date not null,
  participants_count int not null check (participants_count between 0 and 100000),
  activity_description text not null,
  special_activity text not null,
  participant_feedback text not null,
  guest_name text,
  guest_occupation text,
  guest_reason text,
  guest_topics text,
  improvements text not null,
  planning_timeline text not null,
  materials_timeline text not null,
  promotion_timeline text not null,
  activity_timeline text not null,
  feedback_timeline text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, student_id)
);
create index on project_student_sheets (project_id, updated_at desc);

create table project_student_sheet_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  student_id text not null,
  category text not null check (category in ('preparation', 'activity', 'participants')),
  name text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  foreign key (project_id, student_id)
    references project_student_sheets(project_id, student_id) on delete cascade,
  check (storage_project_id(storage_path) is not null and storage_project_id(storage_path) = project_id)
);
create index on project_student_sheet_photos (project_id, student_id);

create table project_student_sheet_evaluations (
  project_id uuid not null,
  student_id text not null,
  innovation smallint not null check (innovation between 1 and 5),
  impact smallint not null check (impact between 1 and 5),
  feedback_score smallint not null check (feedback_score between 1 and 5),
  efficiency smallint not null check (efficiency between 1 and 5),
  updated_by text not null references profiles(clerk_id),
  updated_at timestamptz not null default now(),
  primary key (project_id, student_id),
  foreign key (project_id, student_id)
    references project_student_sheets(project_id, student_id) on delete cascade
);

alter table project_student_sheets enable row level security;
alter table project_student_sheet_photos enable row level security;
alter table project_student_sheet_evaluations enable row level security;

create policy pss_read on project_student_sheets for select using (
  can_access_platform() and (is_project_member(project_id) or is_pn_dept()));
create policy pss_insert on project_student_sheets for insert with check (
  can_access_platform() and student_id = auth.jwt()->>'sub' and is_project_member(project_id));
create policy pss_update on project_student_sheets for update
  using (can_access_platform() and student_id = auth.jwt()->>'sub' and is_project_member(project_id))
  with check (can_access_platform() and student_id = auth.jwt()->>'sub' and is_project_member(project_id));

create policy pssp_read on project_student_sheet_photos for select using (
  can_access_platform() and (is_project_member(project_id) or is_pn_dept()));
create policy pssp_insert on project_student_sheet_photos for insert with check (
  can_access_platform()
  and student_id = auth.jwt()->>'sub'
  and is_project_member(project_id)
  and exists (
    select 1 from project_student_sheets s
    where s.project_id = project_student_sheet_photos.project_id
      and s.student_id = project_student_sheet_photos.student_id));

create policy psse_read on project_student_sheet_evaluations for select using (
  can_access_platform() and (is_project_member(project_id) or is_pn_dept()));
create policy psse_insert on project_student_sheet_evaluations for insert with check (
  can_access_platform() and is_pn_dept() and updated_by = auth.jwt()->>'sub');
create policy psse_update on project_student_sheet_evaluations for update
  using (can_access_platform() and is_pn_dept())
  with check (is_pn_dept() and updated_by = auth.jwt()->>'sub');
