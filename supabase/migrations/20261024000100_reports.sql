-- Reports: the CD builds a form, mentors fill it (as often as they like), the CD reads the answers.
-- Fields are fixed once the form exists (answers are keyed by field id); a form is only opened or closed.
create table report_forms (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 200),
  description text check (length(description) <= 2000),
  fields      jsonb not null,
  is_open     boolean not null default true,
  created_by  text not null references profiles(clerk_id),
  created_at  timestamptz not null default now()
);

create table report_responses (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references report_forms(id) on delete cascade,
  submitted_by text not null references profiles(clerk_id),
  answers      jsonb not null,
  created_at   timestamptz not null default now()
);
create index report_responses_form_idx on report_responses (form_id, created_at desc);

alter table report_forms     enable row level security;
alter table report_responses enable row level security;

create policy rf_read   on report_forms for select using (is_cd() or (my_role() = 'mentor' and is_open));
create policy rf_insert on report_forms for insert with check (is_cd() and created_by = auth.jwt()->>'sub');
create policy rf_update on report_forms for update using (is_cd()) with check (is_cd());

create policy rr_read   on report_responses for select using (is_cd() or submitted_by = auth.jwt()->>'sub');
create policy rr_insert on report_responses for insert with check (
  my_role() = 'mentor'
  and submitted_by = auth.jwt()->>'sub'
  and exists (select 1 from report_forms f where f.id = form_id and f.is_open)
);
