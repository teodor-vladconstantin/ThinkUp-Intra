-- Superadmin, CEO, President and Secretary invite any staff role; a VP only mentors in their department.
drop policy inv_insert on invitations;
create policy inv_insert on invitations for insert with check (
  invited_by = auth.jwt()->>'sub'
  and (
    is_superadmin()
    or (my_role() in ('ceo','president','secretary') and role <> 'student')
    or (my_role() = 'vp' and department_id = my_dept() and role = 'mentor')
    or (is_pn_dept() and role = 'student')));

drop policy inv_read on invitations;
create policy inv_read on invitations for select using (
  is_superadmin()
  or my_role() in ('ceo','president','secretary','vp')
  or (is_pn_dept() and role = 'student'));
