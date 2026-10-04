import { expect, test } from "bun:test";
import { describeChanges } from "./task-history";

const names = {
  person: (id: unknown) => (id === "u1" ? "Ana" : id === "u2" ? "Ion" : "Nealocat"),
  department: (id: unknown) => (id === 1 ? "Tech" : "PN"),
};
const base = { title: "T", status: "todo", assignee_id: "u1", department_id: 1, priority: 2, deadline: null, archived: false };

test("insert", () => {
  expect(describeChanges({ action: "INSERT", diff: base }, names)).toEqual(["a creat sarcina"]);
});

test("only changed fields are reported", () => {
  const diff = { old: base, new: { ...base, status: "in_progress", assignee_id: "u2", completed_at: null } };
  expect(describeChanges({ action: "UPDATE", diff }, names)).toEqual([
    "a schimbat statusul: De făcut → În lucru",
    "a schimbat responsabilul: Ana → Ion",
  ]);
});

test("department move, archive, and a no-op update", () => {
  const moved = { old: base, new: { ...base, department_id: 3, archived: true } };
  expect(describeChanges({ action: "UPDATE", diff: moved }, names)).toEqual([
    "a mutat sarcina: Tech → PN",
    "a arhivat sarcina",
  ]);
  expect(describeChanges({ action: "UPDATE", diff: { old: base, new: base } }, names)).toEqual([]);
});
