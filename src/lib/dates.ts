// Deadlines are picked as a calendar date (<input type="date">) in Romanian time and
// stored as a UTC timestamp: the last second of that day in Europe/Bucharest.
// Using end-of-day means "due on the 10th" only becomes overdue after the 10th ends.

const TZ = "Europe/Bucharest";

// Offset of Bucharest from UTC at a given instant, in ms (+2h winter, +3h summer).
function offsetMs(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - at.getTime();
}

// "2026-10-10" -> ISO string of 2026-10-10 23:59:59 Bucharest time, in UTC.
export function deadlineFromDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  // DST switches happen at 03:00/04:00, never near 23:59, so one correction is exact.
  return new Date(guess.getTime() - offsetMs(guess)).toISOString();
}

// UTC timestamp -> "YYYY-MM-DD" in Bucharest (value for <input type="date">).
export function dateInputValue(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

const dateFmt = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
