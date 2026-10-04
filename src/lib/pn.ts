// National Program shared types and labels.

export const SCHOOL_STATUSES = ["contacted", "interested", "partner", "inactive"] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const SCHOOL_STATUS_LABELS: Record<SchoolStatus, string> = {
  contacted: "Contactat",
  interested: "Interesat",
  partner: "Partener",
  inactive: "Inactiv",
};

// Counties without a zone (PRD 6.1). The color always comes from zones.color, never the county.
export const NO_ZONE_COLOR = "#CBD5E1";

export type Zone = { id: number; name: string; color: string; active: boolean };
export type County = { code: string; name: string; zone_id: number | null };
export type SchoolSummary = { id: number; name: string; city: string | null; county_code: string; status: SchoolStatus };
export type ZoneMove = { id: number; county_code: string; from_zone: number | null; to_zone: number | null; changed_at: string; changer: { full_name: string | null } | null };
