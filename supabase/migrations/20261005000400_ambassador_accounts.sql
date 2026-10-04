-- Platform step 5: ambassadors get their account from the PN side.
--
-- PN invites an ambassador by email: the invitation carries ambassador_id, and on first
-- sign-in the new profile is linked (ambassadors.profile_id). An ambassador who already
-- has an account (a staff member who is also an ambassador) is linked directly by PN.
-- The old platform_user_id (an id on the retired thinkup platform) goes away.

-- ---------------------------------------------------------------------
-- 1. Drop platform_user_id; add_ambassador loses that parameter.
-- ---------------------------------------------------------------------
drop function add_ambassador(text, int, text, text, text);
drop index ambassadors_platform_user_key;
alter table ambassadors drop column platform_user_id;

-- security invoker: runs as the caller, RLS (amb_write, ambc_all) applies to both inserts.
create function add_ambassador(p_full_name text, p_school_id int, p_email text, p_phone text) returns int
language plpgsql security invoker set search_path = public as $$
declare v_id int;
begin
  insert into ambassadors (full_name, school_id) values (btrim(p_full_name), p_school_id)
  returning id into v_id;

  -- Store only what is needed (ambassadors are likely minors): no contacts row if both are empty.
  if nullif(btrim(p_email), '') is not null or nullif(btrim(p_phone), '') is not null then
    insert into ambassador_contacts (ambassador_id, email, phone)
    values (v_id, nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''));
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 2. Invitations for an ambassador.
-- ---------------------------------------------------------------------
alter table invitations add column ambassador_id int references ambassadors(id);
alter table invitations add constraint inv_ambassador_student check (ambassador_id is null or role = 'student');
create unique index invitations_pending_ambassador on invitations (ambassador_id)
  where status = 'pending' and ambassador_id is not null;

-- PN sees the student invitations it manages (status on the school page).
drop policy inv_read on invitations;
create policy inv_read on invitations for select using (
  is_superadmin()
  or my_role() in ('ceo','president','vp')
  or (is_pn_dept() and role = 'student'));
