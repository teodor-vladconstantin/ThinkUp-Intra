// Pure permission rules used by the UI and server actions.
// They MIRROR the RLS policies; they do not replace them. If the two ever disagree,
// Postgres wins: the user client is RLS-bound, so a wrong check here can only show
// an error, never leak data.

export const ROLES = ["ceo", "president", "secretary", "vp", "mentor"] as const;
export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  ceo: "CEO",
  president: "Președinte",
  secretary: "Secretar",
  vp: "VP",
  mentor: "Mentor",
};

export const ALLOWED_EMAIL_DOMAIN = "think-up.academy";

export type Actor = {
  role: AppRole;
  departmentId: number | null;
  isSuperadmin: boolean;
};

export function isAllowedEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

// Mirrors the dept_required / inv_dept_required check constraints.
export function needsDepartment(role: AppRole) {
  return role === "vp" || role === "mentor";
}

// Mirrors is_cd().
export function isCd(a: Actor) {
  return a.isSuperadmin || a.role !== "mentor";
}

// Mirrors inv_read.
export function canSeeInvitations(a: Actor) {
  return a.isSuperadmin || a.role === "ceo" || a.role === "president" || a.role === "vp";
}

// Mirrors inv_insert: superadmin/CEO/President invite anyone, a VP invites only
// mentors into their own department.
export function canInvite(a: Actor, target: { role: AppRole; departmentId: number | null }) {
  if (a.isSuperadmin || a.role === "ceo" || a.role === "president") return true;
  return (
    a.role === "vp" &&
    target.role === "mentor" &&
    a.departmentId !== null &&
    target.departmentId === a.departmentId
  );
}

// Roles the actor may pick in the invitation form.
export function invitableRoles(a: Actor): AppRole[] {
  if (a.isSuperadmin || a.role === "ceo" || a.role === "president") return [...ROLES];
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
