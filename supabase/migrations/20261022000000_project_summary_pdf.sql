-- A project can carry one PDF summary next to its text description.
-- The file lives in project-files/<project_id>/..., like photos and material files.
alter table projects add column summary_path text, add column summary_name text;
alter table projects add constraint summary_path_in_project
  check (summary_path is null or storage_project_id(summary_path) = id);
grant update (summary_path, summary_name) on projects to authenticated;
