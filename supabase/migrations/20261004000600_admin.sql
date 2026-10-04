-- Admin: deactivate / reactivate users, revoke pending invitations.
-- Both go through security definer functions that check permissions themselves,
-- like move_county(): profiles and invitations keep their narrow RLS, and the
-- functions can change exactly one column, nothing else.

-- Same authority as inviting (PRD 3): superadmin, CEO, President manage anyone;
-- a VP manages only mentors of their own department. Never yourself; only a
-- superadmin manages another superadmin.
create function can_manage_user(p_target text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select my_role() is not null
       and t.clerk_id <> (auth.jwt()->>'sub')
       and (not t.is_superadmin or is_superadmin())
       and (is_superadmin()
            or my_role() in ('ceo', 'president')
            or (my_role() = 'vp' and t.role = 'mentor' and t.department_id = my_dept()))
    from profiles t
    where t.clerk_id = p_target), false)
$$;

-- PRD 4: access ends immediately, because every RLS helper filters on is_active.
create function set_user_active(p_clerk_id text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_user(p_clerk_id) then
    raise exception 'not allowed';
  end if;

  update profiles set is_active = p_active where clerk_id = p_clerk_id;

  -- profiles has no audit trigger; record who (de)activated whom.
  insert into activity_log (actor_id, entity, entity_id, action, diff)
  values (auth.jwt()->>'sub', 'profiles', p_clerk_id,
          case when p_active then 'REACTIVATE' else 'DEACTIVATE' end, null);
end $$;

-- Revoke a pending invitation: privileged roles any, a VP the ones they sent.
-- Only status changes (pending -> revoked); role/department stay untouchable.
create function revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update invitations
  set status = 'revoked'
  where id = p_id
    and status = 'pending'
    and my_role() is not null
    and (is_superadmin()
         or my_role() in ('ceo', 'president')
         or invited_by = auth.jwt()->>'sub');
  if not found then
    raise exception 'not allowed or not pending';
  end if;
end $$;
