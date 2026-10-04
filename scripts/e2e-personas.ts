// Persona check against the mock data (run `bun scripts/mock-data.ts seed` first).
// For each persona it counts the mock rows visible under the REAL row-level security rules
// (same mechanism as supabase/tests: role "authenticated" + the persona's JWT subject) and
// compares them with what the product rules say they should see. Read-only, rolled back.
//
// Usage: bun scripts/e2e-personas.ts
import { SQL } from "bun";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}
const db = new SQL(url);

// table label -> count query over MOCK rows only
const QUERIES: Record<string, string> = {
  tasks: "select count(*) from tasks where title like '[MOCK]%'",
  meetings: "select count(*) from meetings where title like '[MOCK]%'",
  announcements: "select count(*) from announcements where title like '[MOCK]%'",
  documents: "select count(*) from documents where title like '[MOCK]%'",
  profiles: "select count(*) from profiles where clerk_id like 'mock\\_%'",
  schools: "select count(*) from schools where name like '[MOCK]%'",
  ambassadors: "select count(*) from ambassadors where full_name like '[MOCK]%'",
  contacts: "select count(*) from ambassador_contacts where email like '%@mock.invalid'",
  projects: "select count(*) from projects where name like '[MOCK]%'",
  challenges: "select count(*) from challenges where name like '[MOCK]%'",
  goals: "select count(*) from goals where name like '[MOCK]%'",
  feedback_peers: "select count(*) from reviews where body like '[MOCK]%'",
  feedback_mentors: "select count(*) from mentor_feedback where body like '[MOCK]%'",
  grades: "select count(*) from submissions where feedback like '[MOCK]%'",
  warnings: "select count(*) from warnings where body like '[MOCK]%'",
  objectives: "select count(*) from personal_objectives where name like '[MOCK]%'",
  puzzle: "select count(*) from puzzle_pieces where profile_id like 'mock\\_%'",
};
const TABLES = Object.keys(QUERIES);

type Expect = Record<string, number | "all">;
const ALL: Expect = Object.fromEntries(TABLES.map((t) => [t, "all"]));
const NONE: Expect = Object.fromEntries(TABLES.map((t) => [t, 0]));

// Product rules (see PRD + migrations 20261005*). Numbers follow from scripts/mock-data.ts.
const PERSONAS: { label: string; sub: string | "SUPERADMIN"; expect: Expect }[] = [
  { label: "superadmin (tu)", sub: "SUPERADMIN", expect: ALL },
  {
    label: "VP PN",
    sub: "mock_vp_pn",
    expect: { ...ALL, meetings: 1, documents: 1 }, // CD meeting only; "all" doc only
  },
  {
    label: "Mentor PN",
    sub: "mock_mentor_pn",
    expect: { ...ALL, tasks: 3, meetings: 0, documents: 1 }, // PN tasks only
  },
  {
    label: "VP Tech",
    sub: "mock_vp_tech",
    // CD sees all tasks and the CD meeting + own department meeting; no PN, no platform; students hidden
    expect: { ...NONE, tasks: "all", meetings: 2, announcements: "all", documents: 2, profiles: 5 },
  },
  {
    label: "Mentor Tech (și ambasador)",
    sub: "mock_mentor_tech",
    // intranet = own department; PN = nothing; platform = yes as an ambassador, but only OWN grades/warnings/objectives
    expect: {
      ...NONE, tasks: 6, meetings: 1, announcements: "all", documents: 2, profiles: 5,
      projects: "all", challenges: "all", goals: "all", feedback_peers: "all", feedback_mentors: "all", puzzle: "all",
    },
  },
  {
    label: "Mentor MK (nu e ambasador)",
    sub: "mock_mentor_mk",
    expect: { ...NONE, tasks: 2, announcements: "all", documents: 1, profiles: 5 }, // nothing from PN or the platform
  },
  {
    label: "Elev Ana",
    sub: "mock_stud_1",
    expect: {
      ...NONE, profiles: 1, // own row only
      projects: "all", challenges: "all", goals: "all", feedback_peers: "all", feedback_mentors: "all", puzzle: "all",
      grades: 1, objectives: 1, // her own
    },
  },
  {
    label: "Elev Bogdan",
    sub: "mock_stud_2",
    expect: { ...NONE, profiles: 1, projects: "all", challenges: "all", goals: "all", feedback_peers: "all", feedback_mentors: "all", puzzle: "all", warnings: 2 },
  },
  {
    label: "Elev Carmen",
    sub: "mock_stud_3",
    expect: { ...NONE, profiles: 1, projects: "all", challenges: "all", goals: "all", feedback_peers: "all", feedback_mentors: "all", puzzle: "all", grades: 1 },
  },
  { label: "Cont fără profil", sub: "mock_nobody", expect: NONE },
];

class Rollback extends Error {}
let failed = 0;
const results: string[][] = [];

try {
  await db.begin(async (tx) => {
    const [me] = await tx`select clerk_id from profiles where is_superadmin and is_active limit 1`;
    const [{ n }] = await tx`select count(*)::int as n from profiles where clerk_id like 'mock\\_%'`;
    if (!n) throw new Error("No mock data: run `bun scripts/mock-data.ts seed` first");

    // owner counts = what "all" means
    const total: Record<string, number> = {};
    for (const t of TABLES) total[t] = Number((await tx.unsafe(QUERIES[t]))[0].count);

    for (const p of PERSONAS) {
      const sub = p.sub === "SUPERADMIN" ? me.clerk_id : p.sub;
      await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
      await tx.unsafe("set local role authenticated");
      for (const t of TABLES) {
        const got = Number((await tx.unsafe(QUERIES[t]))[0].count);
        const want = p.expect[t] === "all" ? total[t] : (p.expect[t] as number);
        const ok = got === want;
        if (!ok) failed++;
        results.push([p.label, t, String(want), String(got), ok ? "PASS" : "FAIL"]);
      }
      await tx.unsafe("reset role");
    }
    throw new Rollback(); // read-only anyway; never keep anything
  });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
} finally {
  await db.close();
}

const rows = results.map(([persona, table, expected, actual, result]) => ({ persona, table, expected, actual, result }));
console.table(rows.filter((r) => r.result === "FAIL"));
const by = new Map<string, { pass: number; fail: number }>();
for (const r of rows) {
  const c = by.get(r.persona) ?? { pass: 0, fail: 0 };
  if (r.result === "PASS") c.pass++;
  else c.fail++;
  by.set(r.persona, c);
}
console.table([...by].map(([persona, c]) => ({ persona, pass: c.pass, fail: c.fail })));
console.log(failed === 0 ? `All ${rows.length} persona checks passed.` : `${failed} of ${rows.length} persona checks FAILED.`);
process.exit(failed === 0 ? 0 : 1);
