# ThinkUp Intranet - PRD and build instructions for Claude Code

## 0. How to work with me (read first)

I am Duku, Tech Director of ThinkUp Academy and the developer of this project. I want to understand every part of the code, because this project goes in my portfolio and I will maintain it.

Rules for the whole project:

1. Work in phases (section 11). Build ONE phase, then STOP and wait for my review. Never start the next phase on your own.
2. Before writing code for a phase, show me a short plan (files to create, order, key decisions) and wait for my OK.
3. After each phase, give me a "What I built and why" note: max 15 lines, naming the main concepts used (for example RLS policies, server actions, middleware, invitation flow). I will be able to explain them in an interview.
4. Explain any non-obvious choice in a code comment or in the note. Prefer simple, readable code over clever code.
5. Use `bun` for all package management and scripts.
6. Never read, print, commit or modify `.env` files. Create `.env.example` with variable names only. Never paste secrets in chat or logs.
7. Check the current official documentation (Next.js, Clerk, Supabase, shadcn/ui, Resend) before using an API. Setup steps for Clerk with Supabase change often, so rely on current docs.
8. When something in this PRD conflicts with itself or looks risky, tell me before implementing.

## 1. Product summary

An internal intranet for ThinkUp Academy, designed as the single source of truth: no task, decision or piece of information gets lost. Today things get lost because nothing is written down and everything sinks in WhatsApp feeds. The intranet makes writing things down the easiest path and makes overdue work visible.

Two modules:

1. **Work module**: tasks with deadlines and overdue banners, meetings with minutes, decisions, documents (Drive links), announcements.
2. **National Program (PN) module**: a map of Romania with development zones, high schools, school contacts, ambassador students.

UI language: Romanian. Code, comments, commit messages and database names: English. Timezone for display: Europe/Bucharest. Store all timestamps in UTC.

## 2. Goals and non-goals

Goals:
- Every task, decision and meeting minute lives in the intranet.
- Overdue and near-deadline work is impossible to miss (banners + email).
- PN gets a visual map and a structured school/ambassador database.
- Access control is enforced in the database (RLS), with the UI as a second layer.

Out of scope for v1: recruitment (exists on the public site), calendar (Google Calendar), chat (WhatsApp), automatic WhatsApp reminders, reports, recurring tasks, global search, a custom document editor.

## 3. Organization and roles

Organization: CEO, President, Secretary, VP Tech, VP MK (marketing), VP PN (national program), then mentors inside each department. Departments: Tech, MK, PN.

CD (Consiliul Director) = CEO, President, Secretary and the three VPs.

Database roles (`app_role` enum): `ceo`, `president`, `secretary`, `vp`, `mentor`. Department is stored separately (`department_id`; null for ceo, president, secretary). A separate `is_superadmin` flag exists for the Tech Director (me): sees everything and administers everything.

### Permission matrix

| Resource | Who can see | Who can write |
|---|---|---|
| Invitations and roles | Superadmin, CEO, President, VPs | Superadmin, CEO, President (any role). A VP can invite only mentors into their own department |
| Tasks | Assignee, creator, members of the executing department, members of the requesting department, all CD | Create: creator is the current user; mentors only inside their own department; CD can create across departments. Update: assignee, creator, VP of the department, CEO, President, superadmin |
| Meeting minutes (department) | Members of that department | VP of that department |
| Meeting minutes (CD) | CD | Secretary |
| Decisions | Same visibility as their meeting | VP or Secretary |
| Documents (Drive links) | By `visibility`: department, cd, all | CD members |
| Announcements | Everyone | CEO, President, VPs |
| PN module (map, schools, ambassadors list) | PN department, CEO, President, Secretary, superadmin | PN department |
| Ambassador contacts (email, phone) | PN department and superadmin only | PN department |
| County to zone moves | PN department members can view history | VP PN and superadmin, through `move_county()` only |

Tech and MK start without access to PN. Opening access for a department later is a one-row change: `departments.can_access_pn = true`.

## 4. Authentication and invitations

- Clerk, in invite-only mode (public sign-up disabled). Google sign-in, because the organization uses Google Workspace.
- Only `@think-up.academy` emails are accepted. Validate the domain on the server when creating an invitation.
- Invitation flow:
  1. An authorized user opens the admin page and enters email, role, department.
  2. A server action checks permissions (see matrix), creates the Clerk invitation (role and department in `publicMetadata`) and inserts a row in `invitations`.
  3. The invited person signs in. On first sign-in a server route (Clerk webhook or first-load check) creates the `profiles` row using the Supabase service role key and marks the invitation `accepted`.
- The role used for authorization is always read from the `profiles` table (by the SQL helper functions), never from client-supplied data.
- Deactivating a user sets `profiles.is_active = false`. Access ends immediately. Their open tasks appear as unassigned on their department's dashboard.
- The Supabase service role key lives only on the server and appears only in server-only modules.

## 5. Work module: functional requirements

### 5.1 Tasks
- Fields: title, description, status (`todo`, `in_progress`, `blocked`, `done`), priority (1 high, 2 normal, 3 low), deadline, assignee, creator, executing department, requesting department, optional links to meeting, school, county, zone.
- A task created by a VP for another department shows in both departments (executing and requesting).
- Views:
  - **My tasks** (default for everyone). Mentors get a toggle "all department tasks / only mine", defaulting to all department tasks.
  - **Department board** (kanban by status and list view).
  - **Leadership view** for CD: all overdue tasks grouped by department.
- Comments on tasks. History of changes visible to anyone who can see the task (read from `activity_log`).
- No hard delete. Archive with `archived = true`.
- Setting status to `done` sets `completed_at`.

### 5.2 Deadline banners
Computed at read time through the `tasks_with_alert` view (`overdue`, `due_soon` for deadline within 48 hours).
- Red banner for overdue, amber banner for due soon. Shown on the personal dashboard of the assignee and on the department dashboard for the VP.
- A persistent banner area at the top of the app shows the count of overdue tasks of the current user with a link to the filtered list.

### 5.3 Email reminders (Resend)
- Immediate email on assignment.
- A scheduled job (Vercel Cron, route handler protected by a secret) runs daily: sends one email for tasks entering the 48-hour window and one for tasks that became overdue.
- Add table `task_notifications (task_id, kind, sent_at)` with a unique constraint on `(task_id, kind)` so no reminder is sent twice. This is an extra migration beyond `intranet_schema.sql`.
- Emails: Romanian, short, with a link to the task.

### 5.4 Meetings, minutes, decisions
- Weekly CD meeting and weekly department meetings. A meeting has title, date, minutes (rich text or markdown), kind (`cd` or `department`).
- The minutes form has a fixed template: attendees, decisions, follow-up tasks.
- Each follow-up task entered in the form (title, assignee, deadline) is created as a real task with `meeting_id` set. The meeting page lists its tasks, and each task links back to its meeting.
- Decisions are listed in a searchable registry per visibility scope, with text, date, author and source meeting.

### 5.5 Documents
- A document is a title, a Google Drive URL, a department, and a visibility (`department`, `cd`, `all`).
- The intranet controls who sees the link. Real file permissions are set in Drive. Show a small note about this on the create form.

### 5.6 Announcements
- Title, body, optional expiry, `important` flag. Shown as a banner on every user's dashboard until archived or expired.

## 6. PN module: functional requirements

### 6.1 Map
- Leaflet map of Romania with a GeoJSON of the 41 counties plus Bucharest. County polygons are matched to `counties.code`. Verify at the start that every GeoJSON feature code matches the seed (watch Bucharest and Ilfov).
- Fill color of a county comes from its zone (`zones.color`). Counties without a zone are gray. A color is never stored on a county.
- Click a county: side panel with zone, schools list, number of ambassadors.
- Click a school: school detail page.
- Moving a county to another zone: dropdown in the side panel, visible to VP PN and superadmin, calls `move_county()`. The map recolors immediately. History is shown in the panel.
- Editing zone name and color: VP PN and superadmin. Requires an additional RLS policy and migration.

### 6.2 Schools
- Fields: name, city, county, contact name, email, phone, relationship status (`contacted`, `interested`, `partner`, `inactive`).
- Contact log per school: who contacted them, when, note.
- Tasks can link to a school, a county or a zone.
- Known edge case: a user without PN access sees a task linked to a school but cannot read the school row. The UI shows "School (restricted access)".

### 6.3 Ambassadors
- Name, school, link to the ambassadors platform (`platform_user_id`), active flag. Email and phone live in `ambassador_contacts` and follow stricter access.
- Data source: the existing ambassadors platform. v1 uses a one-time CSV import. Live sync is a later decision.
- Ambassadors are likely minors. Store only what is needed.

## 7. Data model

The SQL file `intranet_schema.sql` is the source of truth for tables, helper functions, triggers, RLS policies and the county seed. Put it in `supabase/migrations/` as the first migration. Extra migrations needed:
1. `task_notifications` table (section 5.3).
2. RLS policy for editing zones (section 6.1).

Key design points to preserve:
- RLS helper functions (`my_role()`, `my_dept()`, `is_superadmin()`, `is_cd()`, `can_access_pn()`, `is_pn_dept()`) are the single place where access rules live.
- Ambassador contacts are in a separate table because RLS works on rows.
- County moves go only through `move_county()`.
- Overdue state is computed in the `tasks_with_alert` view.
- Archive, never delete.

## 8. Tech stack

- Next.js (App Router, TypeScript), bun
- Tailwind + shadcn/ui
- Clerk (auth), Supabase (Postgres + RLS), Resend (email)
- Leaflet + react-leaflet for the map
- Vercel for hosting, Vercel Cron for the daily reminder job
- Supabase project dedicated to the intranet (separate from the public site)

Server-side authorization: pages and server actions verify the user and role on the server. The Supabase client for user requests uses the Clerk session token so RLS applies. The service role client exists only in server-only modules for profile creation and webhooks.

## 9. Design system

Match the public site think-up.academy.

- Dark deep purple for chrome (sidebar, header): `#1A0B2E` (`--background: 266 61% 11%`).
- Work area: light surface (`--workspace: 210 40% 98%`) with white cards, so long lists stay readable.
- Primary: `--primary: 262 83% 58%`. Use only this token for primary actions. The public site also uses `#9333EA` in a few places, and the intranet uses the token alone to avoid two purples.
- Cards: white, `--card-foreground: 222 47% 11%`, radius `0.75rem` (`--radius`), soft shadow.
- Buttons: pill shape (`rounded-full`). Primary is violet with a soft violet glow. Secondary is outline.
- Section labels: small pills, light violet background, violet text, uppercase.
- Navigation: uppercase, letter-spaced, small icons next to each link, glass blur on the header when scrolling.
- Fonts: Inter for all UI. Playfair Display italic only for the main page title on the dashboard. Do not load Montserrat.
- Status colors: add `--warning: 38 92% 50%` (foreground `222 47% 11%`) and `--success: 142 71% 45%` (foreground white). `--destructive: 0 84% 60%` for overdue.
- Token values to copy from the public site (shadcn variables): `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary: 266 30% 20%`, `--secondary-foreground`, `--muted: 266 30% 20%`, `--muted-foreground: 270 10% 70%`, `--accent: 270 50% 90%`, `--accent-foreground: 266 61% 11%`, `--destructive`, `--border: 266 30% 20%`, `--input`, `--ring: 262 83% 58%`, `--radius: 0.75rem`, and the `--sidebar-*` set (same values as the main tokens).
- Logos: I will copy the logo files into `public/logos/`. Use the light logo on the dark sidebar.
- Responsive from the start (mobile usable). One theme (no dark mode toggle) in v1.

## 10. Security requirements

- RLS enabled on every table (already in the schema). Test it, see section 12.
- Service role key and Clerk secret only in server-only code and environment variables.
- Cron endpoint protected with a secret header.
- Invitation permission checks run on the server and are mirrored by RLS.
- Validate all inputs on the server (zod).
- Contacts of schools and ambassadors never appear in logs, URLs, error messages or analytics.
- Dependencies from official sources only.

## 11. Build phases

Stop at the end of every phase.

**Phase 0 - Setup**
Create the Next.js project with bun, TypeScript, Tailwind, shadcn/ui. Add `.env.example`, `.gitignore` entries, folder structure, `PRD.md` in repo root. Put `intranet_schema.sql` in `supabase/migrations/`. Prerequisites that I do by hand: create the Clerk app, the Supabase project, the Resend account, and fill the environment variables. Tell me exactly which variables you need.

**Phase 1 - Foundation (weekend 1)**
Design tokens in `globals.css`. Layout shell: dark sidebar, header, light work area, navigation with role-aware items. Clerk invite-only with domain restriction. Profile creation on first sign-in. Admin page for invitations with the permission rules from section 3. Route guards. Empty dashboard. A test script or checklist that proves RLS works for four test profiles (Tech mentor, VP Tech, VP PN, Secretary).

**Phase 2 - Tasks (weekend 2)**
Task CRUD, assignment across departments, views, comments, history, banners, Resend emails, cron job, `task_notifications` migration. Deploy to Vercel and give access only to Tech and CD for a one-week trial.

**Phase 3 - Organization (weekend 3)**
Meetings with the minutes template and automatic follow-up tasks, decisions registry, documents, announcements.

**Phase 4 - National Program (weekend 4)**
Zones, county map, moving counties, schools, contact log, ambassadors list and CSV import, task links to schools and zones, zone-editing policy migration.

## 12. Testing and definition of done

For every phase:
- Type-check and lint pass.
- For RLS: log in as each test role and verify what each can read and write on `tasks`, `meetings`, `ambassador_contacts`, `schools`. Record the results in a short table in the phase note.
- Manual walkthrough of the main user flows in the browser.
- No secrets in the repo.

The project is done for v1 when a mentor can log in from an invitation, see their tasks with deadline banners, receive email reminders, a VP can run a meeting with minutes that create tasks, and the PN team can manage schools and move counties on the map.

## 13. Assumptions to confirm with me

- UI language Romanian (change if I say otherwise).
- Cross-department tasks appear in both departments.
- Mentors can create tasks only inside their own department.
- Ambassador data comes from a one-time CSV import.
- WhatsApp reminders stay out of v1.