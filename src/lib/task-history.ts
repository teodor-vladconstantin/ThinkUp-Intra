// Turns activity_log rows (written by the log_activity trigger) into readable lines.
// For UPDATE the trigger stores {old, new} full rows; we only report fields people care about.

import { formatDate } from "@/lib/dates";
import { PRIORITY_LABELS, STATUS_LABELS, type TaskStatus } from "@/lib/tasks";

type Row = Record<string, unknown>;
export type LogEntry = { action: string; diff: Row | null };
export type Names = { person: (id: unknown) => string; department: (id: unknown) => string };

export function describeChanges(entry: LogEntry, names: Names): string[] {
  if (entry.action === "INSERT") return ["a creat sarcina"];
  if (entry.action !== "UPDATE" || !entry.diff) return [];

  const before = (entry.diff.old ?? {}) as Row;
  const after = (entry.diff.new ?? {}) as Row;
  const changed = (k: string) => JSON.stringify(before[k]) !== JSON.stringify(after[k]);
  const lines: string[] = [];

  if (changed("status")) {
    lines.push(`a schimbat statusul: ${STATUS_LABELS[before.status as TaskStatus]} → ${STATUS_LABELS[after.status as TaskStatus]}`);
  }
  if (changed("assignee_id")) {
    lines.push(`a schimbat responsabilul: ${names.person(before.assignee_id)} → ${names.person(after.assignee_id)}`);
  }
  if (changed("deadline")) {
    const d = (v: unknown) => (typeof v === "string" ? formatDate(v) : "fără termen");
    lines.push(`a schimbat termenul: ${d(before.deadline)} → ${d(after.deadline)}`);
  }
  if (changed("department_id")) {
    lines.push(`a mutat sarcina: ${names.department(before.department_id)} → ${names.department(after.department_id)}`);
  }
  if (changed("priority")) {
    lines.push(`a schimbat prioritatea: ${PRIORITY_LABELS[before.priority as number]} → ${PRIORITY_LABELS[after.priority as number]}`);
  }
  if (changed("title")) lines.push(`a redenumit sarcina în „${after.title}”`);
  if (changed("description")) lines.push("a modificat descrierea");
  if (changed("archived") && after.archived) lines.push("a arhivat sarcina");

  return lines;
}
