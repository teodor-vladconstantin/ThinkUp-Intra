-- Platform gallery: every photo of every project, across all challenges, for the board only.
--
-- Who: superadmin, CEO, President, Secretary, and the VPs (PN, Tech, MK) = is_cd().
-- Why a function and not a policy: VP Tech and VP MK are not on the platform (no PN access,
-- not ambassadors), so the normal read rules (can_access_platform) correctly keep them out of
-- projects, grades, warnings... They only get this one aggregated view: photo + project name +
-- challenge name + date. The team's names are shown only to people who are on the platform
-- anyway, so the gallery never exposes students to someone who could not see them before.
--
-- The photo files themselves are signed by the server (service role) AFTER this function has
-- confirmed the caller is allowed, because Storage reads also need can_access_platform().

create function gallery_photos(
  p_challenge uuid default null,
  p_project uuid default null,
  p_no_challenge boolean default false,
  p_limit int default 24,
  p_offset int default 0
) returns table (
  photo_id uuid,
  storage_path text,
  taken_at timestamptz,
  project_id uuid,
  project_name text,
  project_archived boolean,
  challenge_id uuid,
  challenge_name text,
  team text[],
  total bigint
)
language sql stable security definer set search_path = public as $$
  select
    ph.id,
    ph.storage_path,
    ph.created_at,
    p.id,
    p.name,
    p.archived,
    c.id,
    c.name,
    case when can_access_platform() then
      array(select pr.full_name
            from project_members m join profiles pr on pr.clerk_id = m.profile_id
            where m.project_id = p.id and pr.full_name is not null
            order by pr.full_name)
    end,
    count(*) over ()
  from project_photos ph
  join projects p on p.id = ph.project_id
  left join challenges c on c.id = p.challenge_id
  where is_cd()
    and (p_challenge is null or p.challenge_id = p_challenge)
    and (p_project is null or p.id = p_project)
    and (not p_no_challenge or p.challenge_id is null)
  order by ph.created_at desc, ph.id
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
$$;

-- Projects that have at least one photo, with their challenge: feeds the gallery filters.
create function gallery_sources() returns table (
  project_id uuid,
  project_name text,
  challenge_id uuid,
  challenge_name text,
  photos bigint
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, c.id, c.name, count(ph.id)
  from projects p
  join project_photos ph on ph.project_id = p.id
  left join challenges c on c.id = p.challenge_id
  where is_cd()
  group by p.id, p.name, c.id, c.name
  order by c.name nulls last, p.name
$$;

revoke all on function gallery_photos(uuid, uuid, boolean, int, int) from public, anon;
revoke all on function gallery_sources() from public, anon;
grant execute on function gallery_photos(uuid, uuid, boolean, int, int) to authenticated;
grant execute on function gallery_sources() to authenticated;
