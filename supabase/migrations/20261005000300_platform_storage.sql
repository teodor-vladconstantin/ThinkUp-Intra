-- Platform step 3: private file storage for the platform.
--
-- All buckets are private: nothing is reachable by URL alone (the old /storage route
-- served every file to anyone). Reads go through short-lived signed URLs created by
-- the server with the user's token, so these SELECT policies decide who gets one.
-- Uploads: the server asks for a signed upload URL as the user (INSERT policy checked
-- then), the browser uploads straight to Storage, never through a Vercel function.
--
-- Path conventions (first folder decides access):
--   project-files/<project_id>/<anything>   photos, thumbnails, material files
--   avatars/<clerk_id>/<anything>           avatar and cover of a platform profile
--   open-school/<anything>                  Open School library (PN uploads)
-- No UPDATE policies: files are never overwritten in place; upload a new name instead.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-files', 'project-files', false, 52428800, null),                       -- 50 MB, like the old nginx limit
  ('avatars',       'avatars',       false, 5242880,  array['image/png','image/jpeg','image/webp','image/gif']),
  ('open-school',   'open-school',   false, 52428800, null);

-- Project id from the first folder, or null when it is not a uuid (never errors in a policy).
create function storage_project_id(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end
$$;

-- project-files: the platform reads, members of that project write and delete
create policy pf_read on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and can_access_platform());
create policy pf_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and is_project_member(storage_project_id(name)));
create policy pf_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and is_project_member(storage_project_id(name)));

-- avatars: the platform reads, each person writes only their own folder
create policy av_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and can_access_platform());
create policy av_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and can_access_platform()
              and (storage.foldername(name))[1] = auth.jwt()->>'sub');
create policy av_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.jwt()->>'sub');

-- open-school: the platform reads, PN manages
create policy os_read_obj on storage.objects for select to authenticated
  using (bucket_id = 'open-school' and can_access_platform());
create policy os_insert_obj on storage.objects for insert to authenticated
  with check (bucket_id = 'open-school' and is_pn_dept());
create policy os_delete_obj on storage.objects for delete to authenticated
  using (bucket_id = 'open-school' and is_pn_dept());

-- Rows that point at files must point inside their own project / own folder,
-- so nobody can attach (and later delete) a file that belongs to another project.
alter table projects add constraint thumbnail_in_project
  check (thumbnail_path is null or storage_project_id(thumbnail_path) = id);
alter table project_photos add constraint photo_path_in_project
  check (storage_project_id(storage_path) = project_id);
alter table platform_profiles add constraint pprof_avatar_own
  check ((avatar_path is null or (storage.foldername(avatar_path))[1] = profile_id)
     and (cover_path  is null or (storage.foldername(cover_path))[1]  = profile_id));

drop policy mf_ins on material_files;
create policy mf_ins on material_files for insert with check (
  exists (select 1 from materials m
          where m.id = material_id
            and is_project_member(m.project_id)
            and storage_project_id(storage_path) = m.project_id));
