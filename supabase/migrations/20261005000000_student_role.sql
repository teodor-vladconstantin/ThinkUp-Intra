-- Platform step 1a: ambassador students get an account.
-- On its own on purpose: Postgres cannot use a new enum value in the same
-- transaction that adds it, and the next migration uses 'student' everywhere.
alter type app_role add value if not exists 'student';
