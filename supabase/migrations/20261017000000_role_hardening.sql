-- Role hardening found in the access review.
--
-- 1. Peer feedback ("Feedback de la colegi") is for ambassadors. PN mentors give mentor
--    feedback instead, and CEO/President/Secretary only read. The check used to live only
--    in the UI; the database now enforces it. "Ambassador" is a row in ambassadors, not a
--    role, so a Tech mentor who is also an ambassador still counts as a peer.
-- 2. invitations: nobody edits an invitation row from the client. inv_update let CEO/President
--    rewrite role and email of a sent invitation. Revoking goes through revoke_invitation()
--    (security definer); accepting and the Clerk rollback use the server-side secret key.

create function is_peer_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_ambassador() and not is_pn_dept(), false)
$$;

drop policy rev_ins on reviews;
create policy rev_ins on reviews for insert with check (
  is_peer_reviewer()
  and author_id = auth.jwt()->>'sub'
  and not is_project_member(project_id)
  and exists (select 1 from projects p where p.id = project_id and p.accept_reviews and not p.archived));

drop policy inv_update on invitations;
revoke update on invitations from authenticated, anon;
