// Run with: bun test
import { describe, expect, test } from "bun:test";
import { canAccessPn, canInvite, invitableRoles, isAllowedEmail, type Actor } from "./permissions";

const TECH = 1;
const PN = 3;
const superadmin: Actor = { role: "vp", departmentId: TECH, isSuperadmin: true };
const ceo: Actor = { role: "ceo", departmentId: null, isSuperadmin: false };
const secretary: Actor = { role: "secretary", departmentId: null, isSuperadmin: false };
const vpTech: Actor = { role: "vp", departmentId: TECH, isSuperadmin: false };
const mentorTech: Actor = { role: "mentor", departmentId: TECH, isSuperadmin: false };

describe("canInvite", () => {
  test("superadmin and CEO invite any role", () => {
    expect(canInvite(superadmin, { role: "president", departmentId: null })).toBe(true);
    expect(canInvite(ceo, { role: "vp", departmentId: PN })).toBe(true);
  });
  test("VP invites only mentors into own department", () => {
    expect(canInvite(vpTech, { role: "mentor", departmentId: TECH })).toBe(true);
    expect(canInvite(vpTech, { role: "mentor", departmentId: PN })).toBe(false);
    expect(canInvite(vpTech, { role: "vp", departmentId: TECH })).toBe(false);
  });
  test("secretary and mentor cannot invite", () => {
    expect(canInvite(secretary, { role: "mentor", departmentId: TECH })).toBe(false);
    expect(canInvite(mentorTech, { role: "mentor", departmentId: TECH })).toBe(false);
    expect(invitableRoles(mentorTech)).toEqual([]);
  });
});

test("isAllowedEmail accepts only the org domain", () => {
  expect(isAllowedEmail("Ana.Pop@Think-Up.Academy")).toBe(true);
  expect(isAllowedEmail("ana@gmail.com")).toBe(false);
  expect(isAllowedEmail("ana@think-up.academy.evil.com")).toBe(false);
  expect(isAllowedEmail("ana@evilthink-up.academy")).toBe(false);
});

test("canAccessPn: CD leadership yes, Tech mentor no unless flag", () => {
  expect(canAccessPn(secretary, false)).toBe(true);
  expect(canAccessPn(mentorTech, false)).toBe(false);
  expect(canAccessPn(mentorTech, true)).toBe(true);
});
