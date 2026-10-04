import { canWriteMeeting, type Actor, type MeetingKind } from "@/lib/permissions";

export type Meeting = {
  id: string;
  kind: MeetingKind;
  department_id: number | null;
  title: string;
  held_at: string;
  minutes: string | null;
  attendees: string[];
  author_id: string | null;
  department: { name: string } | null;
  author: { full_name: string | null } | null;
};

export const MEETING_SELECT =
  "id, kind, department_id, title, held_at, minutes, attendees, author_id, department:departments(name), author:profiles!author_id(full_name)";

export const meetingLabel = (m: { kind: MeetingKind; department: { name: string } | null }) =>
  m.kind === "cd" ? "CD" : (m.department?.name ?? "Departament");

// The meeting types this actor may create: every candidate that passes canWriteMeeting.
export function meetingTargets(actor: Actor, departments: { id: number; name: string }[]) {
  const candidates = [
    { value: "cd", label: "Consiliul Director", kind: "cd" as const, departmentId: null },
    ...departments.map((d) => ({ value: `dept:${d.id}`, label: `Departament ${d.name}`, kind: "department" as const, departmentId: d.id })),
  ];
  return candidates.filter((c) => canWriteMeeting(actor, c.kind, c.departmentId));
}
