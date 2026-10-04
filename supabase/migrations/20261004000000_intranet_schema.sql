-- =====================================================================
-- ThinkUp Intranet, schema v1
-- Auth: Clerk (third-party auth in Supabase). auth.jwt()->>'sub' = Clerk user id.
-- Profile rows are created server-side (service role) when an invitation is accepted.
-- =====================================================================

-- ---------- ENUMS ----------
create type app_role      as enum ('ceo','president','secretary','vp','mentor');
create type task_status   as enum ('todo','in_progress','blocked','done');
create type meeting_kind  as enum ('cd','department');
create type doc_visibility as enum ('department','cd','all');
create type school_status as enum ('contacted','interested','partner','inactive');
create type invite_status as enum ('pending','accepted','revoked');

-- ---------- ORG ----------
create table departments (
  id serial primary key,
  name text unique not null,
  can_access_pn boolean not null default false  -- regula de acces la modulul PN, intr-un singur loc
);
insert into departments (name, can_access_pn) values ('Tech', false), ('MK', false), ('PN', true);

create table profiles (
  clerk_id text primary key,
  email text unique not null,
  full_name text,
  role app_role not null,
  department_id int references departments(id),
  is_superadmin boolean not null default false,
  is_active boolean not null default true,       -- false cand pleaca cineva
  created_at timestamptz not null default now(),
  constraint dept_required check (role in ('ceo','president','secretary') or department_id is not null)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role app_role not null,
  department_id int references departments(id),
  invited_by text not null references profiles(clerk_id),
  status invite_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------- HELPER FUNCTIONS (folosite in politicile RLS) ----------
create function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where clerk_id = (auth.jwt()->>'sub') and is_active
$$;

create function my_dept() returns int
language sql stable security definer set search_path = public as $$
  select department_id from profiles where clerk_id = (auth.jwt()->>'sub') and is_active
$$;

create function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from profiles
                   where clerk_id = (auth.jwt()->>'sub') and is_active), false)
$$;

-- CD = ceo, president, secretary, cei trei VP
create function is_cd() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_superadmin() or my_role() in ('ceo','president','secretary','vp'), false)
$$;

-- poate vedea modulul PN (harta, licee)
create function can_access_pn() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    is_superadmin()
    or my_role() in ('ceo','president','secretary')
    or exists (select 1 from departments d where d.id = my_dept() and d.can_access_pn),
    false)
$$;

-- face parte din departamentul PN (vede contactele ambasadorilor)
create function is_pn_dept() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    is_superadmin()
    or exists (select 1 from departments d where d.id = my_dept() and d.can_access_pn),
    false)
$$;

-- ---------- PN: ZONE, JUDETE, LICEE, AMBASADORI ----------
create table zones (
  id serial primary key,
  name text unique not null,
  color text not null,                            -- hex, singura sursa de culoare pe harta
  active boolean not null default true
);

create table counties (
  code text primary key,                          -- trebuie sa se potriveasca cu GeoJSON
  name text not null,
  zone_id int references zones(id)                -- null = nealocat, gri pe harta
);

create table county_zone_history (
  id serial primary key,
  county_code text not null references counties(code),
  from_zone int references zones(id),
  to_zone int references zones(id),
  changed_by text references profiles(clerk_id),
  changed_at timestamptz not null default now()
);

create table schools (
  id serial primary key,
  name text not null,
  city text,
  county_code text not null references counties(code),
  contact_name text,
  contact_email text,
  contact_phone text,
  status school_status not null default 'contacted',
  created_at timestamptz not null default now()
);

create table ambassadors (
  id serial primary key,
  full_name text not null,
  school_id int not null references schools(id),
  platform_user_id text,                          -- legatura cu platforma ambasadorilor
  active boolean not null default true
);

-- contactele ambasadorilor stau separat, ca RLS lucreaza pe randuri, nu pe coloane
create table ambassador_contacts (
  ambassador_id int primary key references ambassadors(id) on delete cascade,
  email text,
  phone text
);

create table school_contact_log (
  id serial primary key,
  school_id int not null references schools(id),
  contacted_by text references profiles(clerk_id),
  note text not null,
  contacted_at timestamptz not null default now()
);

-- ---------- SEDINTE, DECIZII ----------
create table meetings (
  id uuid primary key default gen_random_uuid(),
  kind meeting_kind not null,
  department_id int references departments(id),   -- null pentru CD
  title text not null,
  held_at timestamptz not null,
  minutes text,                                   -- minuta (scrisa de secretar sau de VP)
  author_id text references profiles(clerk_id),
  created_at timestamptz not null default now(),
  constraint kind_dept check (
    (kind = 'cd' and department_id is null) or (kind = 'department' and department_id is not null))
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id),
  text text not null,
  author_id text references profiles(clerk_id),
  decided_at date not null default current_date
);

-- ---------- TASKURI ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority smallint not null default 2,           -- 1 mare, 2 normal, 3 mic
  deadline timestamptz,
  assignee_id text references profiles(clerk_id), -- null = nealocat
  creator_id text not null references profiles(clerk_id),
  department_id int references departments(id),   -- departamentul care executa
  requesting_department_id int references departments(id), -- cel care a cerut (colaborare intre VP-i)
  meeting_id uuid references meetings(id),        -- din ce sedinta vine
  school_id int references schools(id),
  county_code text references counties(code),
  zone_id int references zones(id),
  archived boolean not null default false,        -- nu stergem, arhivam
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on tasks (assignee_id, status);
create index on tasks (deadline);
create index on tasks (department_id);
create index on schools (county_code);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id text not null references profiles(clerk_id),
  body text not null,
  created_at timestamptz not null default now()
);

-- bannerul de intarziere se calculeaza la citire, nu se stocheaza
create view tasks_with_alert with (security_invoker = true) as
select t.*,
  case
    when t.archived or t.status = 'done' or t.deadline is null then null
    when t.deadline < now() then 'overdue'
    when t.deadline < now() + interval '48 hours' then 'due_soon'
  end as alert
from tasks t;

-- ---------- DOCUMENTE, ANUNTURI ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,                              -- link Drive; permisiunile reale se seteaza in Drive
  department_id int references departments(id),
  visibility doc_visibility not null default 'department',
  created_by text references profiles(clerk_id),
  created_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  important boolean not null default false,
  author_id text not null references profiles(clerk_id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  archived boolean not null default false
);

-- ---------- ISTORIC (audit) ----------
create table activity_log (
  id bigserial primary key,
  actor_id text,
  entity text not null,
  entity_id text,
  action text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);

create function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into activity_log (actor_id, entity, entity_id, action, diff)
  values (
    auth.jwt()->>'sub', tg_table_name,
    coalesce(rec->>'id', rec->>'code', rec->>'clerk_id'),
    tg_op,
    case when tg_op = 'UPDATE'
         then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
         else rec end);
  return coalesce(new, old);
end $$;

create trigger log_tasks     after insert or update or delete on tasks     for each row execute function log_activity();
create trigger log_counties  after update                    on counties  for each row execute function log_activity();
create trigger log_schools   after insert or update or delete on schools   for each row execute function log_activity();
create trigger log_meetings  after insert or update or delete on meetings  for each row execute function log_activity();
create trigger log_decisions after insert or update or delete on decisions for each row execute function log_activity();

-- ---------- MUTAREA UNUI JUDET (singura cale de a schimba zona) ----------
create function move_county(p_code text, p_zone int) returns void
language plpgsql security definer set search_path = public as $$
declare old_zone int;
begin
  if not (is_superadmin() or (my_role() = 'vp' and is_pn_dept())) then
    raise exception 'not allowed';
  end if;
  select zone_id into old_zone from counties where code = p_code;
  update counties set zone_id = p_zone where code = p_code;
  insert into county_zone_history (county_code, from_zone, to_zone, changed_by)
  values (p_code, old_zone, p_zone, auth.jwt()->>'sub');
end $$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Service role (server-side) ocoleste RLS: il folosim doar pe server,
-- pentru crearea profilelor la acceptarea invitatiei.
-- =====================================================================
alter table departments          enable row level security;
alter table profiles             enable row level security;
alter table invitations          enable row level security;
alter table zones                enable row level security;
alter table counties             enable row level security;
alter table county_zone_history  enable row level security;
alter table schools              enable row level security;
alter table ambassadors          enable row level security;
alter table ambassador_contacts  enable row level security;
alter table school_contact_log   enable row level security;
alter table meetings             enable row level security;
alter table decisions            enable row level security;
alter table tasks                enable row level security;
alter table task_comments        enable row level security;
alter table documents            enable row level security;
alter table announcements        enable row level security;
alter table activity_log         enable row level security;

-- org
create policy dept_read on departments for select using (my_role() is not null);
create policy profiles_read on profiles for select using (my_role() is not null);
-- profiles: fara insert/update din client, doar server (service role)

-- invitatii: VP invita doar mentori in departamentul lui; roluri CD doar CEO/presedinte/superadmin
create policy inv_read on invitations for select
  using (is_superadmin() or my_role() in ('ceo','president','vp'));
create policy inv_insert on invitations for insert with check (
  is_superadmin()
  or my_role() in ('ceo','president')
  or (my_role() = 'vp' and department_id = my_dept() and role = 'mentor'));
create policy inv_update on invitations for update
  using (is_superadmin() or my_role() in ('ceo','president'));

-- taskuri
create policy tasks_read on tasks for select using (
  is_cd()
  or assignee_id = auth.jwt()->>'sub'
  or creator_id  = auth.jwt()->>'sub'
  or department_id = my_dept()
  or requesting_department_id = my_dept());
create policy tasks_insert on tasks for insert with check (
  creator_id = auth.jwt()->>'sub'
  and (is_cd() or department_id = my_dept()));   -- VP/CD pot cere intre departamente, mentorul doar in al lui
create policy tasks_update on tasks for update using (
  is_superadmin()
  or my_role() in ('ceo','president')
  or creator_id  = auth.jwt()->>'sub'
  or assignee_id = auth.jwt()->>'sub'
  or (my_role() = 'vp' and (department_id = my_dept() or requesting_department_id = my_dept())));
-- fara delete: arhivam

create policy comments_read on task_comments for select
  using (exists (select 1 from tasks t where t.id = task_id));   -- RLS-ul de pe tasks se aplica si aici
create policy comments_insert on task_comments for insert
  with check (author_id = auth.jwt()->>'sub'
              and exists (select 1 from tasks t where t.id = task_id));

-- ședințe: CD doar CD, departament doar departamentul
create policy meetings_read on meetings for select using (
  is_superadmin()
  or (kind = 'cd' and is_cd())
  or (kind = 'department' and department_id = my_dept()));
create policy meetings_write on meetings for insert with check (
  is_superadmin()
  or (kind = 'cd' and my_role() = 'secretary')
  or (kind = 'department' and my_role() = 'vp' and department_id = my_dept()));
create policy meetings_update on meetings for update using (
  is_superadmin()
  or (kind = 'cd' and my_role() = 'secretary')
  or (kind = 'department' and my_role() = 'vp' and department_id = my_dept()));

-- decizii mostenesc vizibilitatea sedintei
create policy decisions_read on decisions for select
  using (exists (select 1 from meetings m where m.id = meeting_id));
create policy decisions_write on decisions for insert
  with check (is_superadmin() or (my_role() in ('vp','secretary')
              and exists (select 1 from meetings m where m.id = meeting_id)));

-- documente
create policy docs_read on documents for select using (
  is_superadmin()
  or visibility = 'all'
  or (visibility = 'cd' and is_cd())
  or (visibility = 'department' and department_id = my_dept()));
create policy docs_write on documents for insert
  with check (is_cd() and created_by = auth.jwt()->>'sub');

-- anunturi: toti citesc, CEO/presedinte/VP posteaza
create policy ann_read on announcements for select using (my_role() is not null);
create policy ann_write on announcements for insert
  with check (is_superadmin() or my_role() in ('ceo','president','vp'));
create policy ann_update on announcements for update
  using (is_superadmin() or author_id = auth.jwt()->>'sub');

-- PN
create policy zones_read    on zones    for select using (can_access_pn());
create policy counties_read on counties for select using (can_access_pn());
create policy czh_read      on county_zone_history for select using (can_access_pn());
create policy schools_read  on schools  for select using (can_access_pn());
create policy schools_write on schools  for insert with check (is_pn_dept());
create policy schools_upd   on schools  for update using (is_pn_dept());
create policy amb_read      on ambassadors for select using (can_access_pn());
create policy amb_write     on ambassadors for insert with check (is_pn_dept());
create policy amb_upd       on ambassadors for update using (is_pn_dept());
create policy ambc_all      on ambassador_contacts for all using (is_pn_dept()) with check (is_pn_dept());
create policy scl_read      on school_contact_log for select using (can_access_pn());
create policy scl_insert    on school_contact_log for insert
  with check (is_pn_dept() and contacted_by = auth.jwt()->>'sub');
-- zones se editeaza de VP PN / superadmin (politica separata, adaugata la modulul PN)

-- audit: superadmin vede tot; istoricul unui task se vede daca vezi taskul
create policy log_read on activity_log for select using (
  is_superadmin()
  or (entity = 'tasks' and exists (select 1 from tasks t where t.id::text = entity_id)));

-- ---------- SEED: JUDETE ----------
insert into counties (code, name) values
 ('AB','Alba'),('AR','Arad'),('AG','Argeș'),('BC','Bacău'),('BH','Bihor'),
 ('BN','Bistrița-Năsăud'),('BT','Botoșani'),('BV','Brașov'),('BR','Brăila'),
 ('B','București'),('BZ','Buzău'),('CS','Caraș-Severin'),('CL','Călărași'),
 ('CJ','Cluj'),('CT','Constanța'),('CV','Covasna'),('DB','Dâmbovița'),('DJ','Dolj'),
 ('GL','Galați'),('GR','Giurgiu'),('GJ','Gorj'),('HR','Harghita'),('HD','Hunedoara'),
 ('IL','Ialomița'),('IS','Iași'),('IF','Ilfov'),('MM','Maramureș'),('MH','Mehedinți'),
 ('MS','Mureș'),('NT','Neamț'),('OT','Olt'),('PH','Prahova'),('SM','Satu Mare'),
 ('SJ','Sălaj'),('SB','Sibiu'),('SV','Suceava'),('TR','Teleorman'),('TM','Timiș'),
 ('TL','Tulcea'),('VS','Vaslui'),('VL','Vâlcea'),('VN','Vrancea');