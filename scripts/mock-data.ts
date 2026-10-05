// Mock data for end-to-end testing. Everything it creates is recognisable and removable:
//   - profiles:   clerk_id starts with "mock_", email ends with @mock.invalid (they cannot log in)
//   - other rows: name / title / body starts with "[MOCK]"
//
// Usage:
//   bun scripts/mock-data.ts seed    (re-runnable: cleans first)
//   bun scripts/mock-data.ts clean   (removes every mock row, nothing else)
//
// Needs SUPABASE_DB_URL in .env.local. It connects as the table owner, so RLS is bypassed on
// purpose: this is test data, not application behaviour. Persona checks live in e2e-personas.ts.
import { SQL } from "bun";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}
const db = new SQL(url);
const MOCK_ID = "mock\\_%"; // LIKE pattern, passed as a parameter
const MOCK = "[MOCK]%";
// text[] as a Postgres array literal (parameters are sent as text, then cast)
const arr = (xs: string[]) => `{${xs.map((x) => `"${x}"`).join(",")}}`;

async function clean(tx: SQL) {
  const projects = tx`select id from projects where name like ${MOCK}`;
  // ids needed later to scrub the audit log (its triggers also log our own deletes)
  const taskIds = (await tx`select id::text from tasks where title like ${MOCK}`).map((r: { id: string }) => r.id);
  const meetingIds = (await tx`select id::text from meetings where title like ${MOCK}`).map((r: { id: string }) => r.id);
  const schoolIds = (await tx`select id::text from schools where name like ${MOCK}`).map((r: { id: string }) => r.id);
  const decisionIds = (
    await tx`select id::text from decisions where meeting_id in (select id from meetings where title like ${MOCK})`
  ).map((r: { id: string }) => r.id);

  await tx`delete from puzzle_pieces where profile_id like ${MOCK_ID}`;
  await tx`delete from open_school_favorites where profile_id like ${MOCK_ID}`;
  await tx`delete from warnings where student_id like ${MOCK_ID} or body like ${MOCK}`;
  await tx`delete from submissions where student_id like ${MOCK_ID} or challenge_id in (select id from challenges where name like ${MOCK})`;
  await tx`delete from personal_objectives where owner_id like ${MOCK_ID} or name like ${MOCK}`;
  await tx`delete from mentor_feedback where mentor_id like ${MOCK_ID} or body like ${MOCK} or project_id in (${projects})`;
  await tx`delete from reviews where author_id like ${MOCK_ID} or project_id in (${projects})`;
  await tx`delete from project_photos where project_id in (${projects})`;
  await tx`delete from material_files where material_id in (select id from materials where project_id in (${projects}))`;
  await tx`delete from materials where project_id in (${projects}) or name like ${MOCK}`;
  await tx`delete from goals where project_id in (${projects})`;
  await tx`delete from project_members where project_id in (${projects}) or profile_id like ${MOCK_ID}`;
  await tx`delete from projects where name like ${MOCK}`;
  await tx`delete from challenges where name like ${MOCK}`;
  await tx`delete from platform_profiles where profile_id like ${MOCK_ID}`;
  await tx`delete from invitations where email like '%@mock.invalid'`;
  await tx`delete from ambassador_contacts where ambassador_id in (select id from ambassadors where full_name like ${MOCK})`;
  await tx`delete from ambassadors where full_name like ${MOCK} or profile_id like ${MOCK_ID}`;
  await tx`delete from school_contact_log where school_id in (select id from schools where name like ${MOCK})`;
  await tx`delete from task_comments where task_id in (select id from tasks where title like ${MOCK})`;
  await tx`delete from tasks where title like ${MOCK} or creator_id like ${MOCK_ID} or assignee_id like ${MOCK_ID}`;
  await tx`delete from decisions where meeting_id in (select id from meetings where title like ${MOCK})`;
  await tx`delete from meetings where title like ${MOCK}`;
  await tx`delete from announcements where title like ${MOCK}`;
  await tx`delete from documents where title like ${MOCK}`;
  await tx`delete from schools where name like ${MOCK}`;
  await tx`delete from profiles where clerk_id like ${MOCK_ID}`;

  const ids = [...taskIds, ...meetingIds, ...schoolIds, ...decisionIds];
  if (ids.length) await tx`delete from activity_log where entity_id = any (${arr(ids)}::text[])`;
}

async function seed(tx: SQL) {
  await clean(tx);

  const [me] = await tx`select clerk_id from profiles where is_superadmin and is_active limit 1`;
  if (!me) throw new Error("No active superadmin profile found");
  const meId: string = me.clerk_id;
  const dept = Object.fromEntries((await tx`select id, name from departments`).map((d: { id: number; name: string }) => [d.name, d.id]));

  // ---- people (cannot log in: no Clerk account, email on a reserved domain) ----
  const people: [string, string, string, string, number | null][] = [
    ["mock_vp_tech", "Mock VP Tech", "vp", "vp.tech", dept.Tech],
    ["mock_mentor_tech", "Mock Mentor Tech (și ambasador)", "mentor", "mentor.tech", dept.Tech],
    ["mock_mentor_mk", "Mock Mentor MK", "mentor", "mentor.mk", dept.MK],
    ["mock_vp_pn", "Mock VP PN", "vp", "vp.pn", dept.PN],
    ["mock_mentor_pn", "Mock Mentor PN", "mentor", "mentor.pn", dept.PN],
    ["mock_stud_1", "Mock Elev Ana", "student", "stud1", null],
    ["mock_stud_2", "Mock Elev Bogdan", "student", "stud2", null],
    ["mock_stud_3", "Mock Elev Carmen", "student", "stud3", null],
  ];
  for (const [id, name, role, mail, d] of people) {
    await tx`insert into profiles (clerk_id, email, full_name, role, department_id) values (${id}, ${`${mail}@mock.invalid`}, ${name}, ${role}, ${d})`;
  }

  // ---- PN: school, ambassadors (3 students + 1 Tech mentor who is also an ambassador) ----
  const [school] = await tx`insert into schools (name, city, county_code, contact_name, contact_email, contact_phone, status)
    values ('[MOCK] Liceul Teoretic Test', 'Cluj-Napoca', 'CJ', 'Prof. Mock', 'prof@mock.invalid', '0700000000', 'partner') returning id`;
  const amb: [string, string][] = [
    ["[MOCK] Elev Ana", "mock_stud_1"],
    ["[MOCK] Elev Bogdan", "mock_stud_2"],
    ["[MOCK] Elev Carmen", "mock_stud_3"],
    ["[MOCK] Elev Tech (mentor)", "mock_mentor_tech"],
  ];
  for (const [name, profile] of amb) {
    const [a] = await tx`insert into ambassadors (full_name, school_id, profile_id) values (${name}, ${school.id}, ${profile}) returning id`;
    await tx`insert into ambassador_contacts (ambassador_id, email, phone) values (${a.id}, ${`${profile}@mock.invalid`}, '0711000000')`;
  }
  await tx`insert into school_contact_log (school_id, contacted_by, note) values (${school.id}, 'mock_mentor_pn', '[MOCK] Prima discuție cu liceul')`;

  // ---- meetings, decisions, announcements, documents ----
  const [cd] = await tx`insert into meetings (kind, title, held_at, minutes, author_id, attendees)
    values ('cd', '[MOCK] Ședință CD', now() - interval '3 days', 'Minută de test.', ${meId}, ${arr([meId, "mock_vp_tech", "mock_vp_pn"])}::text[]) returning id`;
  const [dep] = await tx`insert into meetings (kind, department_id, title, held_at, minutes, author_id, attendees)
    values ('department', ${dept.Tech}, '[MOCK] Ședință Tech', now() - interval '1 day', 'Minută departament.', 'mock_vp_tech', ${arr(["mock_vp_tech", "mock_mentor_tech"])}::text[]) returning id`;
  await tx`insert into decisions (meeting_id, text, author_id) values (${cd.id}, '[MOCK] Platforma ambasadorilor intră în producție', ${meId})`;
  await tx`insert into decisions (meeting_id, text, author_id) values (${dep.id}, '[MOCK] Migrăm la Postgres', 'mock_vp_tech')`;
  await tx`insert into announcements (title, body, important, author_id) values ('[MOCK] Anunț important', 'Text de test.', true, ${meId})`;
  await tx`insert into announcements (title, body, important, author_id, expires_at) values ('[MOCK] Anunț expirat', 'Nu ar trebui să se vadă.', false, ${meId}, now() - interval '2 days')`;
  await tx`insert into documents (title, url, visibility, created_by) values ('[MOCK] Document pentru toți', 'https://drive.google.com/mock-all', 'all', ${meId})`;
  await tx`insert into documents (title, url, visibility, department_id, created_by) values ('[MOCK] Document doar Tech', 'https://drive.google.com/mock-tech', 'department', ${dept.Tech}, ${meId})`;

  // ---- tasks: every alert state, several departments, some assigned to the real superadmin ----
  type T = [string, string, number | null, string | null, number, string, number | null, number?];
  // [title, status, deadline offset in days (null = none), assignee, priority, creator, department, schoolId?]
  const tasks: T[] = [
    ["[MOCK] Întârziată 10 zile (mea)", "in_progress", -10, meId, 1, meId, dept.Tech],
    ["[MOCK] Întârziată 3 zile (mea)", "todo", -3, meId, 2, "mock_vp_tech", dept.Tech],
    ["[MOCK] Întârziată 1 zi (mentor Tech)", "todo", -1, "mock_mentor_tech", 1, "mock_vp_tech", dept.Tech],
    ["[MOCK] Termen mâine (mea)", "todo", 1, meId, 2, meId, dept.Tech],
    ["[MOCK] Termen peste 5 zile (mentor MK)", "todo", 5, "mock_mentor_mk", 3, meId, dept.MK],
    ["[MOCK] Fără termen (nealocată)", "todo", null, null, 2, meId, dept.MK],
    ["[MOCK] Blocată", "blocked", 2, "mock_mentor_pn", 1, "mock_vp_pn", dept.PN],
    ["[MOCK] Finalizată", "done", -5, "mock_mentor_tech", 2, "mock_vp_tech", dept.Tech],
    ["[MOCK] PN: vizită la liceu", "todo", 4, "mock_mentor_pn", 2, "mock_vp_pn", dept.PN, school.id],
    ["[MOCK] Întârziată PN", "in_progress", -2, "mock_vp_pn", 1, meId, dept.PN],
  ];
  for (const [title, status, off, assignee, prio, creator, d, schoolId] of tasks) {
    await tx`insert into tasks (title, description, status, priority, deadline, assignee_id, creator_id, department_id, school_id)
      values (${title}, 'Sarcină de test.', ${status}, ${prio},
        ${off === null ? null : tx`now() + make_interval(days => ${off})`}, ${assignee}, ${creator}, ${d}, ${schoolId ?? null})`;
  }
  const [archived] = await tx`insert into tasks (title, status, creator_id, department_id, archived) values ('[MOCK] Arhivată', 'done', ${meId}, ${dept.Tech}, true) returning id`;
  await tx`insert into task_comments (task_id, author_id, body) values (${archived.id}, ${meId}, '[MOCK] comentariu')`;

  // ---- platform ----
  const [past] = await tx`insert into challenges (name, description, deadline, created_by)
    values ('[MOCK] Challenge încheiat', 'Termen depășit.', now() - interval '7 days', 'mock_mentor_pn') returning id`;
  const [open] = await tx`insert into challenges (name, description, deadline, created_by)
    values ('[MOCK] Challenge activ', 'În desfășurare.', now() + interval '14 days', 'mock_mentor_pn') returning id`;

  const [p1] = await tx`insert into projects (name, description, created_by, challenge_id) values ('[MOCK] Aplicație de mediu', 'Proiect de test 1.', 'mock_stud_1', ${past.id}) returning id`;
  const [p2] = await tx`insert into projects (name, description, created_by, challenge_id) values ('[MOCK] Robot de sortare', 'Proiect de test 2.', 'mock_stud_2', ${open.id}) returning id`;
  await tx`insert into projects (name, description, created_by, accept_reviews) values ('[MOCK] Proiect fără feedback', 'Nu acceptă feedback.', 'mock_stud_3', false)`;
  await tx`insert into project_members (project_id, profile_id) values (${p1.id}, 'mock_stud_3')`;

  for (const [pid, g, prog, off] of [
    [p1.id, "[MOCK] Cercetare", 100, -5],
    [p1.id, "[MOCK] Prototip", 40, 6],
    [p2.id, "[MOCK] Design 3D", 70, 3],
  ] as [string, string, number, number][]) {
    await tx`insert into goals (project_id, name, progress, deadline) values (${pid}, ${g}, ${prog}, current_date + ${off}::int)`;
  }
  await tx`insert into materials (project_id, name, description, position, created_by) values (${p1.id}, '[MOCK] Raport', 'Fără fișier atașat.', 0, 'mock_stud_1')`;
  await tx`insert into reviews (project_id, author_id, rating, body) values (${p1.id}, 'mock_stud_2', 5, '[MOCK] Foarte bun!')`;
  await tx`insert into reviews (project_id, author_id, rating, body) values (${p1.id}, 'mock_mentor_tech', 3, '[MOCK] Merge, dar poate mai bine')`;
  await tx`insert into mentor_feedback (project_id, mentor_id, body) values (${p1.id}, 'mock_mentor_pn', '[MOCK] Bravo pentru cercetare')`;
  // grades: Ana + Carmen graded for the closed challenge (one project -> one grade per member); Bogdan not graded
  await tx`insert into submissions (challenge_id, student_id, project_id, innovation, impact, feedback_score, efficiency, feedback, graded_by)
    values (${past.id}, 'mock_stud_1', ${p1.id}, 4, 5, 3, 4, '[MOCK] Foarte bine', 'mock_mentor_pn'), (${past.id}, 'mock_stud_3', ${p1.id}, 4, 5, 3, 4, '[MOCK] Foarte bine', 'mock_mentor_pn')`;
  await tx`insert into warnings (student_id, issued_by, body) values ('mock_stud_2', 'mock_mentor_pn', '[MOCK] Absență nemotivată')`;
  await tx`insert into warnings (student_id, issued_by, body, archived) values ('mock_stud_2', 'mock_mentor_pn', '[MOCK] Avertisment vechi (arhivat)', true)`;
  await tx`insert into personal_objectives (owner_id, name, progress, deadline) values ('mock_stud_1', '[MOCK] Învăț Python', 30, current_date + 20)`;
  await tx`insert into puzzle_pieces (profile_id, piece, given_by) values ('mock_stud_1', 1, 'mock_mentor_pn'), ('mock_stud_1', 4, 'mock_mentor_pn')`;
  await tx`insert into platform_profiles (profile_id, bio, social) values ('mock_stud_1', '[MOCK] Pasionată de roboți.', '{"github": "https://github.com/mock"}')`;
}

const mode = process.argv[2];
try {
  await db.begin(async (tx) => {
    if (mode === "seed") await seed(tx);
    else if (mode === "clean") await clean(tx);
    else throw new Error("Usage: bun scripts/mock-data.ts seed|clean");
  });
  const [{ n }] = await db`select count(*)::int as n from profiles where clerk_id like ${MOCK_ID}`;
  const [{ t }] = await db`select count(*)::int as t from tasks where title like ${MOCK}`;
  console.log(`${mode} done. mock profiles: ${n}, mock tasks: ${t}`);
} finally {
  await db.close();
}
