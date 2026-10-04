-- One-time bootstrap of the first user (Tech Director, superadmin).
-- Nobody can invite the first user from the app, so this row is created by hand.
--
-- Steps:
--   1. Create the user in the Clerk dashboard (Users -> Create user, or send an invitation from there).
--   2. Copy the Clerk user id (starts with "user_") and the exact email.
--   3. Replace the two placeholders below and run this file in the Supabase SQL Editor.
--
-- Not a migration on purpose: it contains personal data and runs exactly once.

insert into profiles (clerk_id, email, full_name, role, department_id, is_superadmin)
select
  'user_REPLACE_ME',                 -- Clerk user id
  lower('REPLACE_ME@think-up.academy'),
  'Duku',
  'vp',
  d.id,
  true
from departments d
where d.name = 'Tech'
on conflict (clerk_id) do nothing;

-- Check: should return exactly one row with is_superadmin = true.
select clerk_id, email, role, department_id, is_superadmin, is_active
from profiles
where is_superadmin;
