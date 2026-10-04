// Runs a SQL check file (default supabase/tests/rls_check.sql) inside one transaction,
// prints PASS/FAIL per check, then ROLLS BACK so no test data is left behind.
//
// Usage: bun run rls:check [path/to/check.sql]
// Needs SUPABASE_DB_URL in .env.local (Bun loads it automatically). Use the
// "Session pooler" or direct connection string from Supabase -> Connect.
import { SQL } from "bun";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

type Row = { persona: string; check_name: string; expected: string; actual: string };

const db = new SQL(url);
const file = process.argv[2] ?? "supabase/tests/rls_check.sql";
const script = await Bun.file(file).text();

class Rollback extends Error {}
let rows: Row[] = [];
try {
  await db.begin(async (tx) => {
    await tx.unsafe(script);
    rows = await tx`select persona, check_name, expected, actual from rls_results order by id`;
    throw new Rollback(); // always undo the fixtures
  });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
} finally {
  await db.close();
}

console.table(rows.map((r) => ({ ...r, result: r.expected === r.actual ? "PASS" : "FAIL" })));
const failed = rows.filter((r) => r.expected !== r.actual).length;
console.log(failed === 0 ? `All ${rows.length} checks passed.` : `${failed} of ${rows.length} checks FAILED.`);
process.exit(failed === 0 ? 0 : 1);
