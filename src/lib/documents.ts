export const VISIBILITIES = ["department", "cd", "all"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  department: "Departament",
  cd: "Consiliul Director",
  all: "Toată lumea",
};

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

// Documents are links to Google Drive only (PRD 5.5). https + an exact host match,
// so "drive.google.com.evil.com" or "javascript:" links are rejected.
export function isDriveUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && DRIVE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
