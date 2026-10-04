-- Admin mini-phase: set_user_active(), revoke_invitation().
-- Run with: bun run rls:check supabase/tests/admin_check.sql   (always rolled back)

create temp table rls_results (id serial, persona text, check_name text, expected text, actual text);
grant all on rls_results to public;
grant usage on sequence rls_results_id_seq to public;

create function pg_temp.cnt(q text) returns text language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') s' into n; return n::text; end $$;

create function pg_temp.try(q text) returns text language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count;
  return case when n > 0 then 'ok' else 'denied' end;
exception when others then return 'denied';
end $$;

create function pg_temp.val(q text) returns text language plpgsql as $$
declare v text;
begin execute q into v; return coalesce(v, 'null'); end $$;

-- ---------- fixtures ----------
insert into profiles (clerk_id, email, full_name, role, department_id, is_superadmin) values
  ('a_super',  'a.super@think-up.academy',  'A Super',     'vp',        (select id from departments where name = 'Tech'), true),
  ('a_super2', 'a.super2@think-up.academy', 'A Super 2',   'vp',        (select id from departments where name = 'Tech'), true),
  ('a_ceo',    'a.ceo@think-up.academy',    'A CEO',       'ceo',       null, false),
  ('a_pres',   'a.pres@think-up.academy',   'A President', 'president', null, false),
  ('a_vptech', 'a.vptech@think-up.academy', 'A VP Tech',   'vp',        (select id from departments where name = 'Tech'), false),
  ('a_vppn',   'a.vppn@think-up.academy',   'A VP PN',     'vp',        (select id from departments where name = 'PN'), false),
  ('a_mtech',  'a.mtech@think-up.academy',  'A Mentor T',  'mentor',    (select id from departments where name = 'Tech'), false),
  ('a_mpn',    'a.mpn@think-up.academy',    'A Mentor PN', 'mentor',    (select id from departments where name = 'PN'), false);

insert into invitations (id, email, role, department_id, invited_by) values
  ('20000000-0000-0000-0000-000000000001', 'a.inv1@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'a_vptech'),
  ('20000000-0000-0000-0000-000000000002', 'a.inv2@think-up.academy', 'mentor', (select id from departments where name = 'PN'),   'a_vppn'),
  ('20000000-0000-0000-0000-000000000003', 'a.inv3@think-up.academy', 'vp',     (select id from departments where name = 'MK'),   'a_ceo');
insert into invitations (id, email, role, department_id, invited_by, status) values
  ('20000000-0000-0000-0000-000000000004', 'a.inv4@think-up.academy', 'mentor', (select id from departments where name = 'Tech'), 'a_vptech', 'accepted');

-- =====================================================================
-- VP Tech
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"a_vptech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'deactivate own mentor', 'ok', pg_temp.try($q$select set_user_active('a_mtech', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'deactivate PN mentor', 'denied', pg_temp.try($q$select set_user_active('a_mpn', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'deactivate VP PN', 'denied', pg_temp.try($q$select set_user_active('a_vppn', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'deactivate self', 'denied', pg_temp.try($q$select set_user_active('a_vptech', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'direct profile update still blocked', 'denied', pg_temp.try($q$update profiles set is_active = false where clerk_id = 'a_mpn'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'revoke own pending invitation', 'ok', pg_temp.try($q$select revoke_invitation('20000000-0000-0000-0000-000000000001')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'revoke someone else''s invitation', 'denied', pg_temp.try($q$select revoke_invitation('20000000-0000-0000-0000-000000000002')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'revoke an accepted invitation', 'denied', pg_temp.try($q$select revoke_invitation('20000000-0000-0000-0000-000000000004')$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'cannot escalate own invitation to vp', 'denied', pg_temp.try($q$update invitations set role = 'vp' where id = '20000000-0000-0000-0000-000000000001'$q$));
reset role;

-- The deactivated mentor has lost access, the revocation stuck, and both are audited.
select set_config('request.jwt.claims', '{"sub":"a_mtech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('deactivated mentor', 'my_role() is null', 'null', pg_temp.val($q$select my_role()::text$q$));
reset role;
insert into rls_results (persona, check_name, expected, actual) values
  ('audit', 'invitation 1 revoked', 'revoked', pg_temp.val($q$select status::text from invitations where id = '20000000-0000-0000-0000-000000000001'$q$)),
  ('audit', 'invitation 1 role untouched', 'mentor', pg_temp.val($q$select role::text from invitations where id = '20000000-0000-0000-0000-000000000001'$q$)),
  ('audit', 'deactivation logged with actor', 'a_vptech', pg_temp.val($q$select actor_id from activity_log where entity = 'profiles' and entity_id = 'a_mtech' and action = 'DEACTIVATE'$q$));

-- =====================================================================
-- VP Tech reactivates; mentor tries to manage
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"a_vptech","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'reactivate own mentor', 'ok', pg_temp.try($q$select set_user_active('a_mtech', true)$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"a_mpn","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'deactivate another mentor', 'denied', pg_temp.try($q$select set_user_active('a_mtech', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'revoke an invitation', 'denied', pg_temp.try($q$select revoke_invitation('20000000-0000-0000-0000-000000000002')$q$));
reset role;

-- =====================================================================
-- CEO and superadmins
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"a_ceo","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'deactivate President', 'ok', pg_temp.try($q$select set_user_active('a_pres', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'deactivate a superadmin', 'denied', pg_temp.try($q$select set_user_active('a_super', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('ceo', 'revoke any pending invitation', 'ok', pg_temp.try($q$select revoke_invitation('20000000-0000-0000-0000-000000000002')$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"a_pres","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('deactivated president', 'cannot manage anyone', 'denied', pg_temp.try($q$select set_user_active('a_mtech', false)$q$));
reset role;

select set_config('request.jwt.claims', '{"sub":"a_super","role":"authenticated"}', true);
set local role authenticated;
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'deactivate another superadmin', 'ok', pg_temp.try($q$select set_user_active('a_super2', false)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('superadmin', 'deactivate self', 'denied', pg_temp.try($q$select set_user_active('a_super', false)$q$));
reset role;
