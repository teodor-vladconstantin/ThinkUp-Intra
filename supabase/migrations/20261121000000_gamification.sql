-- Gamification: XP events, badges, leaderboard functions and notification claims.

create table xp_events (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(clerk_id),
  kind text not null check (kind in ('goal_progress', 'material', 'photo')),
  xp int not null check (xp >= 0),
  source_id uuid,
  created_at timestamptz not null default now()
);
create index xp_events_profile_created on xp_events (profile_id, created_at);
create index xp_events_created on xp_events (created_at);

create table user_badges (
  profile_id text not null references profiles(clerk_id),
  badge_key text not null,
  earned_at timestamptz not null default now(),
  primary key (profile_id, badge_key)
);
create index user_badges_earned on user_badges (earned_at);

alter table xp_events enable row level security;
alter table user_badges enable row level security;

revoke insert, update, delete on xp_events from authenticated, anon;
revoke insert, update, delete on user_badges from authenticated, anon;

create policy xp_events_read on xp_events for select using (
  (profile_id = auth.jwt()->>'sub' and exists (
    select 1 from profiles p where p.clerk_id = auth.jwt()->>'sub' and p.is_active
  )) or is_pn_dept()
);
create policy user_badges_read on user_badges for select using (
  (profile_id = auth.jwt()->>'sub' and exists (
    select 1 from profiles p where p.clerk_id = auth.jwt()->>'sub' and p.is_active
  )) or is_pn_dept()
);

create table gamification_notification_claims (
  profile_id text not null references profiles(clerk_id),
  kind text not null check (kind in ('streak_risk', 'new_badge', 'rank_change')),
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (profile_id, kind, week_start)
);
alter table gamification_notification_claims enable row level security;

create table gamification_rank_snapshots (
  profile_id text not null references profiles(clerk_id),
  scope text not null,
  period text not null,
  rank int not null,
  snapshot_week date not null,
  primary key (profile_id, scope, period, snapshot_week)
);
alter table gamification_rank_snapshots enable row level security;
revoke all on gamification_notification_claims, gamification_rank_snapshots from authenticated, anon;

-- Cap each XP source at its daily allowance. The trigger awards XP at most once
-- per source? goal/material/photo activity may create one event per source action.
create function log_gamification_xp(p_profile text, p_kind text, p_source uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p_xp int;
  p_cap int;
  p_used int;
begin
  p_xp := case p_kind
    when 'goal_progress' then 10
    when 'material' then 5
    when 'photo' then 5
    else 0
  end;
  p_cap := case p_kind
    when 'goal_progress' then 30
    when 'material' then 20
    when 'photo' then 15
    else 0
  end;
  if p_profile is null or p_xp = 0 then return; end if;

  select coalesce(sum(xp), 0) into p_used
  from xp_events
  where profile_id = p_profile
    and kind = p_kind
    and created_at >= date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
    and created_at < (date_trunc('day', now() at time zone 'Europe/Bucharest') + interval '1 day') at time zone 'Europe/Bucharest';

  if p_used + p_xp <= p_cap then
    insert into xp_events (profile_id, kind, xp, source_id)
    values (p_profile, p_kind, p_xp, p_source);
  end if;
end $$;

-- Extend the existing platform activity trigger with XP, while retaining activity_events.
create or replace function log_platform_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text := auth.jwt()->>'sub'; pid uuid; k text; source uuid;
begin
  if actor is null then return new; end if;
  if tg_table_name = 'goals' then pid := new.project_id; k := 'goal_progress'; source := new.id;
  elsif tg_table_name = 'materials' then pid := new.project_id; k := 'material'; source := new.id;
  elsif tg_table_name = 'material_files' then select project_id into pid from materials where id = new.material_id; k := 'material'; source := new.id;
  elsif tg_table_name = 'project_photos' then pid := new.project_id; k := 'photo'; source := new.id;
  else return new;
  end if;
  insert into activity_events (profile_id, kind, project_id) values (actor, k, pid);
  perform log_gamification_xp(actor, k, source);
  return new;
end $$;

create function gamification_period_bounds(p_period text)
returns table(start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case p_period
      when 'week' then date_trunc('week', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
      when 'month' then date_trunc('month', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
      else date_trunc('year', (now() at time zone 'Europe/Bucharest') - interval '8 months') at time zone 'Europe/Bucharest' + interval '8 months'
    end,
    now();
$$;

create function gamification_leaderboard(p_scope text, p_period text, p_limit int)
returns table(rank bigint, profile_id text, full_name text, xp bigint, school_name text, is_me boolean)
language sql stable security definer set search_path = public as $$ 
  with bounds as (select * from gamification_period_bounds(p_period)),
  me as (
    select a.* from ambassadors a
    where a.profile_id = auth.jwt()->>'sub' and a.active
  ),
  eligible as (
    select a.profile_id, p.full_name, s.name as school_name, s.county_code, c.zone_id
    from ambassadors a
    join schools s on s.id = a.school_id
    join counties c on c.code = s.county_code
    join profiles p on p.clerk_id = a.profile_id
    where a.active
      and p.is_active
      and (is_pn_dept() or exists (select 1 from me))
  ),
  scoped as (
    select e.* from eligible e
    where
      is_pn_dept()
      or (
        exists (select 1 from me)
        and (
          (p_scope = 'school' and e.school_name = (select s.name from schools s join me mm on mm.school_id = s.id))
          or (p_scope = 'county' and e.county_code = (select s.county_code from schools s join me mm on mm.school_id = s.id))
          or (p_scope = 'zone' and e.zone_id = (select c.zone_id from schools s join counties c on c.code = s.county_code join me mm on mm.school_id = s.id))
          or p_scope = 'country'
        )
      )
  ),
  totals as (
    select s.profile_id, s.full_name, s.school_name,
      coalesce(sum(x.xp) filter (where x.created_at >= (select start_at from bounds) and x.created_at <= (select end_at from bounds)), 0)::bigint as xp
    from scoped s left join xp_events x on x.profile_id = s.profile_id
    group by s.profile_id, s.full_name, s.school_name
  ),
  ranked as (
    select t.*, row_number() over (order by xp desc, profile_id asc)::bigint as rank,
      t.profile_id = auth.jwt()->>'sub' as is_me
    from totals t
  ),
  me_rank as (select rank from ranked where is_me),
  selected as (
    select r.* from ranked r cross join (select max(rank) as rank from me_rank) mr
    where r.rank <= greatest(1, least(coalesce(p_limit, 10), 100))
       or r.is_me
       or (mr.rank is not null and r.rank between mr.rank - 3 and mr.rank + 3)
  )
  select rank, profile_id, full_name, xp, school_name, is_me
  from selected order by rank;
$$;

create function gamification_aggregate(p_scope text, p_period text)
returns table(rank bigint, id text, name text, avg_xp numeric, active_students bigint)
language sql stable security definer set search_path = public as $$
  with bounds as (select * from gamification_period_bounds(p_period)),
  student_xp as (
    select x.profile_id, sum(x.xp)::numeric as xp
    from xp_events x cross join bounds b
    where x.created_at >= b.start_at and x.created_at <= b.end_at
    group by x.profile_id
  ),
  country_zone as (
    select z.id::text as id, z.name, avg(sx.xp) as avg_xp,
      count(distinct a.profile_id)::bigint as active_students
    from zones z
    join counties c on c.zone_id = z.id
    join schools s on s.county_code = c.code
    join ambassadors a on a.school_id = s.id and a.active
    join student_xp sx on sx.profile_id = a.profile_id
    group by z.id, z.name
  ),
  county_rows as (
    select c.code as id, c.name, avg(sx.xp) as avg_xp,
      count(distinct a.profile_id)::bigint as active_students
    from counties c
    join schools s on s.county_code = c.code
    join ambassadors a on a.school_id = s.id and a.active
    join student_xp sx on sx.profile_id = a.profile_id
    group by c.code, c.name
  ),
  rows as (
    select * from country_zone where p_scope in ('zone', 'country')
    union all
    select * from county_rows where p_scope = 'county'
  )
  select row_number() over (order by avg_xp desc nulls last, name asc)::bigint as rank,
         id, name, coalesce(avg_xp, 0)::numeric as avg_xp, active_students
  from rows
  where active_students > 0 and can_access_platform()
  order by rank;
$$;

create function gamification_my_progress()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pid text := auth.jwt()->>'sub';
  p_xp bigint;
  p_level int;
  p_level_xp bigint;
  p_next_xp bigint;
  p_streak int;
  p_weeks text[];
  p_linked boolean;
  p_active boolean;
  p_badges jsonb;
  p_ranks jsonb;
  p_goal_done boolean;
  p_cursor date;
  p_earliest date;
  p_first_week boolean := true;
  p_month text;
  p_forgiven_months text[] := '{}'::text[];
begin
  select coalesce(sum(xp), 0) into p_xp from xp_events where profile_id = pid;
  p_level := greatest(1, (floor(sqrt(p_xp::numeric / 100)) + 1)::int);
  p_level_xp := ((p_level - 1) * (p_level - 1) * 100)::bigint;
  p_next_xp := (p_level * p_level * 100)::bigint;

  select array_agg(distinct week::text order by week::text) into p_weeks
  from activity_weeks where profile_id = pid;
  p_weeks := coalesce(p_weeks, '{}'::text[]);
  p_streak := 0;
  select min(w::date) into p_earliest from unnest(p_weeks) as weeks(w);
  if p_earliest is not null then
    p_cursor := date_trunc('week', now() at time zone 'Europe/Bucharest')::date;
    while p_cursor >= p_earliest loop
      if p_cursor::text = any(p_weeks) then
        p_streak := p_streak + 1;
      elsif p_first_week then
        null;
      else
        p_month := to_char(p_cursor, 'YYYY-MM');
        if p_month = any(p_forgiven_months) then exit; end if;
        p_forgiven_months := array_append(p_forgiven_months, p_month);
      end if;
      p_first_week := false;
      p_cursor := p_cursor - 7;
    end loop;
  end if;

  select exists(select 1 from ambassadors where profile_id = pid and active) into p_linked;
  select exists(
    select 1 from xp_events
    where profile_id = pid
      and created_at >= date_trunc('week', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
  ) into p_active;
  select exists(select 1 from goals g join project_members m on m.project_id = g.project_id
                where m.profile_id = pid and g.progress >= 100) into p_goal_done;

  p_badges := jsonb_build_array(
    jsonb_build_object('key','first','label','Primul pas','hint','Prima activitate în platformă','earned', cardinality(p_weeks)>0,'earnedAt',(select earned_at from user_badges where profile_id=pid and badge_key='first'),'progress',null),
    jsonb_build_object('key','steady','label','Constant','hint','4 săptămâni la rând','earned',(select exists(select 1 from user_badges where profile_id=pid and badge_key='steady')),'earnedAt',(select earned_at from user_badges where profile_id=pid and badge_key='steady'),'progress',least(cardinality(p_weeks)/4.0,1)),
    jsonb_build_object('key','unstoppable','label','De neoprit','hint','12 săptămâni la rând','earned',(select exists(select 1 from user_badges where profile_id=pid and badge_key='unstoppable')),'earnedAt',(select earned_at from user_badges where profile_id=pid and badge_key='unstoppable'),'progress',least(cardinality(p_weeks)/12.0,1)),
    jsonb_build_object('key','goal','label','Obiectiv atins','hint','Un goal la 100%','earned',coalesce(p_goal_done,false),'earnedAt',(select earned_at from user_badges where profile_id=pid and badge_key='goal'),'progress',null),
    jsonb_build_object('key','points','label','Punctaj','hint','50 de puncte în anul școlar','earned',p_xp>=50,'earnedAt',(select earned_at from user_badges where profile_id=pid and badge_key='points'),'progress',least(p_xp/50.0,1))
  );

  if p_linked and p_active then
    p_ranks := jsonb_build_object(
      'school',(select rank from gamification_leaderboard('school','week',100) where profile_id=pid),
      'county',(select rank from gamification_leaderboard('county','week',100) where profile_id=pid),
      'zone',(select rank from gamification_leaderboard('zone','week',100) where profile_id=pid),
      'country',(select rank from gamification_leaderboard('country','week',100) where profile_id=pid)
    );
  else
    p_ranks := jsonb_build_object('school',null,'county',null,'zone',null,'country',null);
  end if;

  return jsonb_build_object(
    'xp',p_xp,'level',p_level,'levelXp',p_level_xp,'nextLevelXp',p_next_xp,'streak',p_streak,
    'badges',p_badges,'ranks',p_ranks
  );
end $$;

-- Sync user_badges from the earned state. Called by XP/activity triggers.
create function sync_gamification_badges(p_profile text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p_xp bigint;
  p_weeks int;
  p_goal boolean;
begin
  select coalesce(sum(xp),0) into p_xp from xp_events where profile_id=p_profile;
  select count(*) into p_weeks from activity_weeks where profile_id=p_profile;
  select exists(select 1 from goals g join project_members m on m.project_id=g.project_id
                where m.profile_id=p_profile and g.progress>=100) into p_goal;

  if p_weeks > 0 then insert into user_badges(profile_id,badge_key) values(p_profile,'first') on conflict do nothing; end if;
  if p_weeks >= 4 then insert into user_badges(profile_id,badge_key) values(p_profile,'steady') on conflict do nothing; end if;
  if p_weeks >= 12 then insert into user_badges(profile_id,badge_key) values(p_profile,'unstoppable') on conflict do nothing; end if;
  if p_xp >= 50 then insert into user_badges(profile_id,badge_key) values(p_profile,'points') on conflict do nothing; end if;
  if p_goal then insert into user_badges(profile_id,badge_key) values(p_profile,'goal') on conflict do nothing; end if;
end $$;

create function sync_gamification_badges_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_gamification_badges(new.profile_id);
  return new;
end $$;
create trigger sync_gamification_badges_after_xp
  after insert on xp_events
  for each row execute function sync_gamification_badges_trigger();

grant execute on function gamification_leaderboard(text,text,int) to authenticated;
grant execute on function gamification_aggregate(text,text) to authenticated;
grant execute on function gamification_my_progress() to authenticated;
