-- Per-page onboarding tours: the keys of the pages whose tour this person already saw
-- (src/lib/section-tours.ts). Written only by the server with the secret key.
alter table profiles add column onboarding_sections text[] not null default '{}';
