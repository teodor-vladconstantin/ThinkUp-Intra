// Pure permission rules used by the UI and server actions.
// They MIRROR the RLS policies; they do not replace them. If the two ever disagree,
// Postgres wins: the user client is RLS-bound, so a wrong check here can only show
// an error, never leak data.

// student = ambassador student with an account (no department, platform only).
export const ROLES = ["ceo", "president", "secretary", "vp", "mentor", "student"] as const;
export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  ceo: "CEO",
  president: "Președinte",
  secretary: "Secretar",
  vp: "VP",
  mentor: "Mentor",
  student: "Elev ambasador",
};

// Exact domains only, not any subdomain. Some mentors only have the mentor.* address.
// The domain only decides who may sign in; the role always comes from the invitation.
export const ALLOWED_EMAIL_DOMAINS = ["think-up.academy", "mentor.think-up.academy"] as const;
export const ALLOWED_EMAIL_HINT = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(" sau ");

export type Actor = {
  role: AppRole;
  departmentId: number | null;
  isSuperadmin: boolean;
};

// Optional because only PN rules need it; Profile always has it.
type MaybeDept = { departmentName?: string | null };

export function isAllowedEmail(email: string) {
  const [local, domain, ...rest] = email.trim().toLowerCase().split("@");
  return !!local && rest.length === 0 && (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain ?? "");
}

// Mirrors is_staff(): anyone but a student. Students never enter the intranet.
export function isStaff(a: Actor) {
  return a.role !== "student";
}

// Mirrors the dept_required / inv_dept_required check constraints.
export function needsDepartment(role: AppRole) {
  return role === "vp" || role === "mentor";
}

// Mirrors is_cd().
export function isCd(a: Actor) {
  return a.isSuperadmin || ["ceo", "president", "secretary", "vp"].includes(a.role);
}

// Superadmin, CEO, President and Secretary invite any staff role; VP only mentors below.
function isInviteAdmin(a: Actor) {
  return a.isSuperadmin || a.role === "ceo" || a.role === "president" || a.role === "secretary";
}

// Mirrors inv_read.
export function canSeeInvitations(a: Actor) {
  return isInviteAdmin(a) || a.role === "vp";
}

// Mirrors inv_insert: superadmin/CEO/President/Secretary invite any staff role,
// a VP only mentors into their own department, the PN department invites students.
export function canInvite(a: Actor & MaybeDept, target: { role: AppRole; departmentId: number | null }) {
  if (a.isSuperadmin) return true;
  if (isInviteAdmin(a)) return target.role !== "student";
  if (target.role === "student") return isPnMember(a);
  return (
    a.role === "vp" &&
    target.role === "mentor" &&
    a.departmentId !== null &&
    target.departmentId === a.departmentId
  );
}

// Roles the actor may pick in the admin invitation form. Students are never invited
// there: PN invites them from the ambassador's record, so the account gets linked.
export function invitableRoles(a: Actor & MaybeDept): AppRole[] {
  if (isInviteAdmin(a)) return ROLES.filter((r) => r !== "student");
  return a.role === "vp" ? ["mentor"] : [];
}

// Mirrors can_access_pn(); deptCanAccessPn is departments.can_access_pn of the actor.
export function canAccessPn(a: Actor, deptCanAccessPn: boolean) {
  return (
    a.isSuperadmin ||
    a.role === "ceo" ||
    a.role === "president" ||
    a.role === "secretary" ||
    deptCanAccessPn
  );
}

// ---------- tasks ----------

export type TaskRef = {
  creatorId: string;
  assigneeId: string | null;
  departmentId: number | null;
  requestingDepartmentId: number | null;
};

// Mirrors tasks_insert: CD creates in any department, a mentor only in their own.
export function canCreateTaskIn(a: Actor, departmentId: number | null) {
  return isCd(a) || (departmentId !== null && departmentId === a.departmentId);
}

// Mirrors tasks_update.
export function canEditTask(a: Actor & { clerkId: string }, t: TaskRef) {
  if (a.isSuperadmin || a.role === "ceo" || a.role === "president") return true;
  if (t.creatorId === a.clerkId || t.assigneeId === a.clerkId) return true;
  return (
    a.role === "vp" &&
    a.departmentId !== null &&
    (t.departmentId === a.departmentId || t.requestingDepartmentId === a.departmentId)
  );
}

// Mirrors the tasks_guard trigger: only CD moves a task between departments.
export const canMoveTask = isCd;

// ---------- meetings, documents, announcements ----------

export type MeetingKind = "cd" | "department";

// Mirrors meetings_write / meetings_update / decisions_write:
// CD minutes by the Secretary, department minutes by that department's VP.
export function canWriteMeeting(a: Actor, kind: MeetingKind, departmentId: number | null) {
  if (a.isSuperadmin) return true;
  if (kind === "cd") return a.role === "secretary";
  return a.role === "vp" && departmentId !== null && departmentId === a.departmentId;
}

// Mirrors docs_write.
export const canCreateDocument = isCd;

// Mirrors ann_write.
export function canPostAnnouncement(a: Actor) {
  return a.isSuperadmin || a.role === "ceo" || a.role === "president" || a.role === "vp";
}

// Mirrors docs_update / ann_update: the author (or superadmin) archives their own item.
export function canManageOwn(a: Actor & { clerkId: string }, authorId: string | null) {
  return a.isSuperadmin || (authorId !== null && authorId === a.clerkId);
}

// ---------- National Program ----------

type WithDepartment = Actor & { departmentName: string | null };

// Mirrors is_pn_dept(): membership of the PN department itself (not the can_access_pn flag).
// Writes schools, contact log, ambassadors; the only ones who see ambassador contacts.
// Also the platform mentors (grading, warnings, feedback).
export function isPnMember(a: Actor & MaybeDept) {
  return a.isSuperadmin || a.departmentName === "PN";
}

// Mirrors move_county() and zones_insert / zones_update: VP PN or superadmin.
export function canManageZones(a: WithDepartment) {
  return a.isSuperadmin || (a.role === "vp" && a.departmentName === "PN");
}

// ---------- admin ----------

export type ManagedUser = { clerkId: string; role: AppRole; departmentId: number | null; isSuperadmin: boolean };

// Mirrors can_manage_user() in SQL: same authority as inviting; never yourself;
// only a superadmin manages another superadmin.
export function canManageUser(a: Actor & MaybeDept & { clerkId: string }, t: ManagedUser) {
  if (t.clerkId === a.clerkId) return false;
  if (t.isSuperadmin && !a.isSuperadmin) return false;
  if (a.isSuperadmin || a.role === "ceo" || a.role === "president") return true;
  if (t.role === "student") return isPnMember(a);
  return a.role === "vp" && t.role === "mentor" && a.departmentId !== null && t.departmentId === a.departmentId;
}

// Mirrors revoke_invitation(): privileged roles any pending invitation, others only their own.
export function canRevokeInvitation(a: Actor & { clerkId: string }, invitedBy: string) {
  return a.isSuperadmin || a.role === "ceo" || a.role === "president" || invitedBy === a.clerkId;
}
