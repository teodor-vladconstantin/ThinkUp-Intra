# Gamification: tasks

Scope: everything automatic (XP, streak, badges) plus leaderboards by school, county, zone and country.
Contract between FE and BE: `src/lib/gamification-types.ts`. FE imports only from `src/lib/gamification-api.ts`.

## Decisions

- Only students linked to an ambassador (`ambassadors.profile_id`) appear in leaderboards. Others still get XP, streak and badges.
- Full name shown, no opt-out. PN sees everything.
- Aggregates (county, zone) use average XP per active student (at least one XP event in the period), not a sum.
- XP weights are constants in `src/lib/gamification.ts`, with a daily cap per event kind.
- No backfill: XP starts at 0 at launch.
- Periods: week, month, school year.

## Day 1 (both)

- Validate `gamification-types.ts`.
- Fix XP weights and the level formula as constants in `gamification.ts`.

## Backend: Alex

1. XP and badge schema: migration with `xp_events` and `user_badges`, triggers on goals, materials and photos, daily XP cap.
2. XP logic in `gamification.ts`: weights, streak multiplier, levels, new badges with `earnedAt` and `progress`, with tests.
3. SQL leaderboard functions: individuals by school, county, zone and country, per period. Ambassador-linked students only.
4. Aggregates: average XP per active student by county and zone.
5. Replace the fixtures in `gamification-api.ts` with real calls, keeping the signatures.
6. RLS tests in `supabase/tests`: what a student sees, what PN sees, what a student without an ambassador does NOT see.
7. Notifications: cron plus Resend for "streak at risk", "new badge", "rank change".

## Frontend: Cristi

1. New profile card replacing "Constanță": level, XP bar, streak, badges with progress.
2. `/platform/leaderboard`: tabs for school, county, zone, country; period selector (branded Select, no native controls); own row highlighted.
3. Aggregate tables for counties and zones.
4. Empty states: student without ambassador (use `FIXTURE_UNRANKED`), period with no activity, loading.
5. New-badge celebration (toast), sidebar entry, mobile layout.

## Rules

- Branches `gam-backend` and `gam-frontend`, both from master.
- Backend owns `supabase/` migrations. Frontend does not touch it.
- Changes to `gamification-types.ts` go in a small separate PR.
- Cross-review: FE reviews the API as its consumer, BE reviews RLS against what the pages show.
