# Ambassador streak and badges (lite gamification)

Goal: consistency. Ambassadors come back weekly and keep working on their project. Gamification stays a small card on `/platform/me`, not the centre of the platform.

## Data
- `activity_events (id, profile_id, kind, project_id, created_at)`; `kind` in `goal_progress | material | photo`.
- Written only by `security definer` triggers: `goals` (when `progress` changes), `materials` (insert), `material_files` (insert), `project_photos` (insert). Actor = `auth.jwt()->>'sub'`; no JWT (service role, seeds) = no event.
- RLS: select own events (with platform access) or `is_pn_dept()`. Insert/update/delete revoked for `authenticated` and `anon`.
- View `activity_weeks (profile_id, week)`: distinct Monday (Europe/Bucharest) per profile, `security_invoker`.

## Logic (`src/lib/gamification.ts`, pure)
- `weeklyStreak(weeks, today)`: walk back from the current week. Active week = +1. The current week without activity does not break the streak (still running). A past empty week uses that calendar month's one grace (no +1, no break); a second empty week in the same month ends it. Stops at the earliest active week.
- `bestStreak(weeks)`: max `weeklyStreak` evaluated at each active week. Badges use it, so they are never taken away.
- Badges (computed at read, no table): Primul pas (any activity), Constant (best >= 4), De neoprit (best >= 12), Obiectiv atins (a goal at 100%), Punctaj (>= 50 points this school year, grades + bonus).

## UI
- `StreakCard` in `PersonView`, shown only where private data is visible (self + PN mentors). Flame + streak, badge row, unearned in grey. No popups, leaderboard, XP or levels.

## Out of scope
Notifications, email reminders, streak history, team badges, anti-abuse (a slider nudge counts as activity; tighten later with a minimum delta or one event per day).

## Checks
- `bun test src` for the streak and badge logic.
- `supabase/tests/activity_check.sql` (via `bun run rls:check <file>`): triggers write events, a student sees only their own, direct insert/update/delete denied, PN mentor sees all.
