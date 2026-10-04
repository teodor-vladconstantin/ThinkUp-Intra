-- Phase 4: National Program (zones, counties, schools, ambassadors).

-- ---------------------------------------------------------------------
-- 1. PRD 10: school contacts never appear in logs.
-- log_activity stored the full schools row (contact name, email, phone) in
-- activity_log. Strip those keys before writing; scrub anything already logged.
-- ---------------------------------------------------------------------
create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  private_keys text[] := case when tg_table_name = 'schools'
                              then array['contact_name', 'contact_email', 'contact_phone']
                              else '{}'::text[] end;
  rec jsonb := to_jsonb(coalesce(new, old)) - private_keys;
begin
  insert into activity_log (actor_id, entity, entity_id, action, diff)
  values (
    auth.jwt()->>'sub', tg_table_name,
    coalesce(rec->>'id', rec->>'code', rec->>'clerk_id'),
    tg_op,
    case when tg_op = 'UPDATE'
         then jsonb_build_object('old', to_jsonb(old) - private_keys, 'new', to_jsonb(new) - private_keys)
         else rec end);
  return coalesce(new, old);
end $$;

update activity_log
set diff = case
  when action = 'UPDATE' then jsonb_build_object(
    'old', (diff->'old') - array['contact_name', 'contact_email', 'contact_phone'],
    'new', (diff->'new') - array['contact_name', 'contact_email', 'contact_phone'])
  else diff - array['contact_name', 'contact_email', 'contact_phone'] end
where entity = 'schools';

-- ---------------------------------------------------------------------
-- 2. Zones: VP PN and superadmin create and edit them (PRD 6.1).
-- The map reads the color straight from here, so it must be a real hex color.
-- ---------------------------------------------------------------------
alter table zones add constraint zone_color_hex check (color ~ '^#[0-9a-fA-F]{6}$');

create policy zones_insert on zones for insert
  with check (is_superadmin() or (my_role() = 'vp' and is_pn_dept()));
create policy zones_update on zones for update
  using (is_superadmin() or (my_role() = 'vp' and is_pn_dept()));

-- ---------------------------------------------------------------------
-- 3. Ambassadors: one row per platform account (also makes a later CSV import
-- re-runnable). Manual add of an ambassador + contacts in one transaction.
-- ---------------------------------------------------------------------
create unique index ambassadors_platform_user_key
  on ambassadors (platform_user_id) where platform_user_id is not null;

-- security invoker: runs as the caller, RLS (amb_write, ambc_all) applies to both inserts.
create function add_ambassador(
  p_full_name text,
  p_school_id int,
  p_platform_user_id text,
  p_email text,
  p_phone text
) returns int
language plpgsql security invoker set search_path = public as $$
declare v_id int;
begin
  insert into ambassadors (full_name, school_id, platform_user_id)
  values (btrim(p_full_name), p_school_id, nullif(btrim(p_platform_user_id), ''))
  returning id into v_id;

  -- Store only what is needed (ambassadors are likely minors): no contacts row if both are empty.
  if nullif(btrim(p_email), '') is not null or nullif(btrim(p_phone), '') is not null then
    insert into ambassador_contacts (ambassador_id, email, phone)
    values (v_id, nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''));
  end if;

  return v_id;
end $$;
