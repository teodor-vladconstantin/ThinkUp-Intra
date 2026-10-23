-- Guided onboarding tour. The profile stores the last tour version the person finished or
-- closed; the app shows the tour again whenever ONBOARDING_VERSION (src/lib/onboarding.ts)
-- is higher. Existing users start at 0, so everyone sees it once. Written only by the server
-- with the secret key, never from the client.
alter table profiles add column onboarding_version int not null default 0;
