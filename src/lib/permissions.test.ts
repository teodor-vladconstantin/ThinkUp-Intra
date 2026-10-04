// Run with: bun test
import { describe, expect, test } from "bun:test";
import {
  canAccessPn,
  canCreateTaskIn,
  canEditTask,
  canInvite,
  canMoveTask,
  canWriteMeeting,
  invitableRoles,
  isAllowedEmail,
  type Actor,
} from "./permissions";

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

describe("tasks", () => {
  const task = { creatorId: "vp_tech", assigneeId: "mentor_tech", departmentId: TECH, requestingDepartmentId: null };
  const asUser = (a: Actor, clerkId: string) => ({ ...a, clerkId });

  test("mentor creates only in own department, CD anywhere", () => {
    expect(canCreateTaskIn(mentorTech, TECH)).toBe(true);
    expect(canCreateTaskIn(mentorTech, PN)).toBe(false);
    expect(canCreateTaskIn(vpTech, PN)).toBe(true);
    expect(canCreateTaskIn(secretary, PN)).toBe(true);
  });

  test("edit: assignee, creator, VP of the department; not the secretary", () => {
    expect(canEditTask(asUser(mentorTech, "mentor_tech"), task)).toBe(true);
    expect(canEditTask(asUser(mentorTech, "other_mentor"), task)).toBe(false);
    expect(canEditTask(asUser(vpTech, "some_vp"), task)).toBe(true);
    expect(canEditTask(asUser({ role: "vp", departmentId: PN, isSuperadmin: false }, "vp_pn"), task)).toBe(false);
    expect(canEditTask(asUser(secretary, "sec"), task)).toBe(false);
    expect(canEditTask(asUser(ceo, "ceo"), task)).toBe(true);
  });

  test("only CD moves tasks between departments", () => {
    expect(canMoveTask(mentorTech)).toBe(false);
    expect(canMoveTask(vpTech)).toBe(true);
  });
});

describe("meetings", () => {
  test("CD minutes: secretary only; department minutes: that VP only", () => {
    expect(canWriteMeeting(secretary, "cd", null)).toBe(true);
    expect(canWriteMeeting(vpTech, "cd", null)).toBe(false);
    expect(canWriteMeeting(vpTech, "department", TECH)).toBe(true);
    expect(canWriteMeeting(vpTech, "department", PN)).toBe(false);
    expect(canWriteMeeting(secretary, "department", TECH)).toBe(false);
    expect(canWriteMeeting(superadmin, "department", PN)).toBe(true);
  });
});
