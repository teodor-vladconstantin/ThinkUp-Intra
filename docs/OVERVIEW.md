# ThinkUp Intranet: developer documentation

Internal intranet for ThinkUp Academy. Product spec and decisions: [PRD.md](../PRD.md).
UI language is Romanian; code, comments, commits and database names are English. Timestamps are stored in UTC and shown in Europe/Bucharest.

## Modules

| Module | Route | What it does |
|---|---|---|
| Work | `/dashboard`, `/tasks`, `/board`, `/meetings`, `/decisions`, `/documents`, `/announcements`, `/leadership` | Tasks with deadlines and overdue banners, meeting minutes, decisions, Drive-link documents, announcements |
| National Program (PN) | `/pn` | Map of Romania with development zones, schools, school contacts, ambassador students |
| Admin | `/admin` | Invitations, users, roles, activation |
| Platform | `/platform` | Area for ambassador students: projects, challenges, gallery, open school, people, streaks and badges |
| Auth | `/sign-in`, `/sign-up` | Clerk, invite-only |

## Stack

Next.js 16 (App Router, TypeScript) · bun · Tailwind 4 + shadcn/ui · Clerk (auth) · Supabase (Postgres + RLS + storage) · Leaflet (map) · Resend (email reminders) · Vercel (region `dub1`).

> Next.js 16 differs from older versions (e.g. `middleware.ts` is now `src/proxy.ts`). Read `node_modules/next/dist/docs/` before changing framework-level code.

## Roles and access

Roles (`app_role`): `ceo`, `president`, `secretary`, `vp`, `mentor`, `student`. Staff roles belong to a department (Tech, MK, PN) where required (`vp`, `mentor`). `is_superadmin` is a separate flag for the Tech Director. CD = CEO, President, Secretary, VPs. Students never enter the intranet, only `/platform`.

Authorization is layered:

1. **Postgres RLS**: the source of truth, enforced on every query made with the user client.
2. `src/lib/permissions.ts`: pure functions that mirror the RLS rules for the UI and server actions. If they disagree, Postgres wins.
3. `src/app/(app)/layout.tsx` and `requireProfile()` in every server action.

`src/proxy.ts` only exposes the Clerk session; it does not decide access.

Only `@think-up.academy` and `@mentor.think-up.academy` emails can sign in, and the role always comes from the invitation / `profiles` table, never from client data.

## Code map

```
src/app/                    routes: (auth), (app) intranet, platform
src/components/             feature components + ui/ (shadcn)
src/lib/auth.ts             current profile, requireProfile()
src/lib/permissions.ts      role/permission rules (+ tests)
src/lib/supabase/           browser / server (RLS-bound) / admin (service role, server-only)
src/lib/tasks*.ts           task queries, history, alerts
src/lib/meetings.ts, documents.ts, announcements.ts, invitations.ts
src/lib/pn.ts               zones, counties, schools, ambassadors
src/lib/platform.ts         student platform data
src/lib/gamification.ts     weekly streak + badges (pure)
supabase/migrations/        SQL, applied in filename order
scripts/rls-check.ts        runs a SQL check file in a rolled-back transaction
scripts/build-counties-geojson.ts   builds the county map data
```

The service role key (`SUPABASE_SECRET_KEY`) is used only in `src/lib/supabase/admin.ts`, which is `server-only`.

## Database

Migrations in `supabase/migrations/` are the source of truth for tables, RLS helper functions (`is_cd()`, `is_staff()`, ...), policies and the county seed. Apply in order with `supabase db push` or the SQL Editor, then run `supabase/seed_superadmin.sql` once by hand to create the first superadmin.

County-to-zone moves go through `move_county()` only; tasks have a guard trigger that limits which fields each role may change.

## Invitation flow

1. An authorized user enters email, role and department on `/admin`.
2. A server action checks the permission matrix and the email domain, creates the Clerk invitation and inserts an `invitations` row.
3. On first sign-in the `profiles` row is created with the service role and the invitation is marked `accepted`. Empty names are filled from Clerk, falling back to the email.

## Setup

```bash
bun install
cp .env.example .env.local   # fill in Clerk, Supabase, Resend values
bun dev                      # http://localhost:3000
```

Environment variables are listed in `.env.example` (never commit `.env.local`).

## Commands

| Command | Purpose |
|---|---|
| `bun dev` / `bun run build` / `bun start` | Run, build, serve |
| `bun run lint` | ESLint |
| `bun run typecheck` | `next typegen` + `tsc --noEmit` |
| `bun test` | Unit tests in `src/` (permissions, dates, tasks history, gamification, ...) |
| `bun run rls:check [file.sql]` | Run RLS persona checks (needs `SUPABASE_DB_URL`) |

## Deploy

Vercel, region `dub1`. Set the same environment variables as `.env.example` in the Vercel project.
