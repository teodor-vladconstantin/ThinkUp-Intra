# ThinkUp Intranet

Internal intranet for ThinkUp Academy. Full spec: [PRD.md](PRD.md).

Stack: Next.js (App Router, TypeScript), bun, Tailwind + shadcn/ui, Clerk, Supabase (Postgres + RLS), Resend.

## Run locally

```bash
bun install
cp .env.example .env.local   # then fill in the values
bun dev
```

## Structure

```
src/app/              routes (App Router)
src/components/ui/    shadcn/ui components
src/lib/              server and shared helpers (Supabase clients, auth, permissions)
supabase/migrations/  SQL migrations, applied in filename order
supabase/seed_superadmin.sql   one-time manual bootstrap of the first superadmin
```

## Database

Migrations live in `supabase/migrations/`. The first one (`*_intranet_schema.sql`) is the source of truth
for tables, RLS helper functions, policies and the county seed. Apply them in order
(Supabase SQL Editor or `supabase db push`), then run `supabase/seed_superadmin.sql` once by hand.
