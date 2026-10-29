-- Platform step 5: PN invites ambassadors / links existing accounts.
-- Run with: bun run rls:check supabase/tests/ambassador_accounts_check.sql   (always rolled back)

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

create function pg_temp.as_user(sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
end $$;

-- ---------- fixtures (as table owner) ----------
insert into profiles (clerk_id, email, full_name, role, department_id) values
  ('w_pn',     'w.pn@think-up.academy',     'W Mentor PN',   'mentor', (select id from departments where name = 'PN')),
  ('w_vptech', 'w.vptech@think-up.academy', 'W VP Tech',     'vp',     (select id from departments where name = 'Tech')),
  ('w_tech',   'w.tech@think-up.academy',   'W Mentor Tech', 'mentor', (select id from departments where name = 'Tech'));
insert into schools (name, county_code) values ('W Liceu', 'CJ');
insert into ambassadors (full_name, school_id)
select n, (select id from schools where name = 'W Liceu') from (values ('W Elev'), ('W Tech Elev')) v(n);

set local role authenticated;

-- PN: invitation for an ambassador; one pending per ambassador; only as student
select pg_temp.as_user('w_pn');
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'add ambassador (new signature)', 'ok', pg_temp.try($q$select add_ambassador('W Nou', (select id from schools where name = 'W Liceu'), null, null)$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'import ambassador and contact atomically', '1', pg_temp.val($q$
    select import_ambassadors(jsonb_build_array(jsonb_build_object(
      'full_name', 'W CSV Elev',
      'school_id', (select id from schools where name = 'W Liceu'),
      'email', 'w.csv@think-up.academy',
      'phone', '+40123456789'
    )))::text
  $q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'reject duplicate CSV ambassador', 'denied', pg_temp.try($q$
    select import_ambassadors(jsonb_build_array(jsonb_build_object(
      'full_name', 'W CSV Elev',
      'school_id', (select id from schools where name = 'W Liceu')
    )))
  $q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'invite ambassador', 'ok', pg_temp.try($q$insert into invitations (email, role, invited_by, ambassador_id) select 'w.elev@think-up.academy', 'student', 'w_pn', id from ambassadors where full_name = 'W Elev'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'second pending invite, same ambassador', 'denied', pg_temp.try($q$insert into invitations (email, role, invited_by, ambassador_id) select 'w.elev2@think-up.academy', 'student', 'w_pn', id from ambassadors where full_name = 'W Elev'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'ambassador invite with mentor role', 'denied', pg_temp.try($q$insert into invitations (email, role, department_id, invited_by, ambassador_id) select 'w.x@think-up.academy', 'mentor', (select id from departments where name = 'PN'), 'w_pn', id from ambassadors where full_name = 'W Tech Elev'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'reads student invitations', '1', pg_temp.cnt($q$select 1 from invitations where email = 'w.elev@think-up.academy'$q$));
-- a staff member who is also an ambassador: linked directly
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'link existing Tech account', 'ok', pg_temp.try($q$update ambassadors set profile_id = 'w_tech' where full_name = 'W Tech Elev'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'link same account twice', 'denied', pg_temp.try($q$update ambassadors set profile_id = 'w_tech' where full_name = 'W Nou'$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('mentor_pn', 'revoke own invitation', 'ok', pg_temp.try($q$select revoke_invitation((select id from invitations where email = 'w.elev@think-up.academy'))$q$));

-- The linked Tech mentor now reaches the platform, but still sees nothing of PN.
select pg_temp.as_user('w_tech');
insert into rls_results (persona, check_name, expected, actual) values
  ('tech_ambassador', 'can_access_platform after link', 'true', pg_temp.val($q$select can_access_platform()::text$q$)),
  ('tech_ambassador', 'ambassadors still hidden', '0', pg_temp.cnt($q$select 1 from ambassadors$q$)),
  ('tech_ambassador', 'student invitations hidden', '0', pg_temp.cnt($q$select 1 from invitations where role = 'student'$q$));

-- Outside PN: no ambassador invitations, no linking.
select pg_temp.as_user('w_vptech');
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'invite ambassador', 'denied', pg_temp.try($q$insert into invitations (email, role, invited_by, ambassador_id) select 'w.y@think-up.academy', 'student', 'w_vptech', id from ambassadors limit 1$q$));
insert into rls_results (persona, check_name, expected, actual) values
  ('vp_tech', 'link an account', 'denied', pg_temp.try($q$update ambassadors set profile_id = 'w_vptech' where full_name = 'W Nou'$q$));

reset role;

-- platform_user_id is gone
insert into rls_results (persona, check_name, expected, actual) values
  ('owner', 'platform_user_id dropped', '0', pg_temp.cnt($q$select 1 from information_schema.columns where table_name = 'ambassadors' and column_name = 'platform_user_id'$q$));
