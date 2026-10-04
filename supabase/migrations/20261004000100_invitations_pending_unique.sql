-- At most one pending invitation per email (case-insensitive).
-- Profile creation looks up the pending invitation by lower(email), so this
-- guarantees the lookup is unambiguous. Accepted/revoked rows are not affected,
-- so the same person can be re-invited after a revoke.
create unique index invitations_pending_email_key
  on invitations (lower(email))
  where status = 'pending';
