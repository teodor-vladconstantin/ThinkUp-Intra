// Run with: bun test
import { describe, expect, test } from "bun:test";
import {
  canAccessPn,
  canCreateTaskIn,
  canEditTask,
  canInvite,
  canManageUser,
  canManageZones,
  canMoveTask,
  canWriteMeeting,
  invitableRoles,
  isAllowedEmail,
  isCd,
  isPnMember,
  isStaff,
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

test("isAllowedEmail accepts only the org domain and the mentor subdomain", () => {
  expect(isAllowedEmail("Ana.Pop@Think-Up.Academy")).toBe(true);
  expect(isAllowedEmail("ana@mentor.think-up.academy")).toBe(true);
  expect(isAllowedEmail("ana@gmail.com")).toBe(false);
  expect(isAllowedEmail("ana@think-up.academy.evil.com")).toBe(false);
  expect(isAllowedEmail("ana@evilthink-up.academy")).toBe(false);
  expect(isAllowedEmail("ana@other.think-up.academy")).toBe(false);
  expect(isAllowedEmail("@think-up.academy")).toBe(false);
  expect(isAllowedEmail("a@b@think-up.academy")).toBe(false);
});

describe("students", () => {
  const student: Actor = { role: "student", departmentId: null, isSuperadmin: false };
  const vpPn = { role: "vp" as const, departmentId: PN, isSuperadmin: false, departmentName: "PN" };
  const mentorPn = { role: "mentor" as const, departmentId: PN, isSuperadmin: false, departmentName: "PN" };
  const asStudent = { role: "student" as const, departmentId: null };

  test("a student is not staff and not CD", () => {
    expect(isStaff(student)).toBe(false);
    expect(isStaff(mentorTech)).toBe(true);
    expect(isCd(student)).toBe(false);
    expect(isCd(mentorTech)).toBe(false);
    expect(isCd(secretary)).toBe(true);
  });

  test("only PN (and CEO/President/superadmin) invite students", () => {
    expect(canInvite(mentorPn, asStudent)).toBe(true);
    expect(canInvite(vpPn, asStudent)).toBe(true);
    expect(canInvite(ceo, asStudent)).toBe(true);
    expect(canInvite({ ...vpTech, departmentName: "Tech" }, asStudent)).toBe(false);
    expect(canInvite(student, asStudent)).toBe(false);
    expect(invitableRoles(vpPn)).toEqual(["mentor"]); // students: from the PN ambassador record
    expect(invitableRoles(ceo)).not.toContain("student");
    expect(invitableRoles({ ...vpTech, departmentName: "Tech" })).toEqual(["mentor"]);
  });

  test("only PN manages students", () => {
    const target = { clerkId: "s", role: "student" as const, departmentId: null, isSuperadmin: false };
    expect(canManageUser({ ...mentorPn, clerkId: "m" }, target)).toBe(true);
    expect(canManageUser({ ...vpTech, departmentName: "Tech", clerkId: "v" }, target)).toBe(false);
  });
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

describe("national program", () => {
  const withDept = (a: Actor, departmentName: string | null) => ({ ...a, departmentName });
  const vpPn = withDept({ role: "vp", departmentId: PN, isSuperadmin: false }, "PN");
  const mentorPn = withDept({ role: "mentor", departmentId: PN, isSuperadmin: false }, "PN");

  test("PN membership is the department, not the access flag", () => {
    expect(isPnMember(mentorPn)).toBe(true);
    expect(isPnMember(withDept(secretary, null))).toBe(false); // sees the map, not ambassador contacts
    expect(isPnMember(withDept(mentorTech, "Tech"))).toBe(false);
  });

  test("only VP PN (and superadmin) manage zones and move counties", () => {
    expect(canManageZones(vpPn)).toBe(true);
    expect(canManageZones(mentorPn)).toBe(false);
    expect(canManageZones(withDept(vpTech, "Tech"))).toBe(false);
    expect(canManageZones(withDept(superadmin, "Tech"))).toBe(true);
  });
});

describe("admin", () => {
  const me = (a: Actor, clerkId: string) => ({ ...a, clerkId });
  const user = (clerkId: string, a: Actor) => ({ clerkId, role: a.role, departmentId: a.departmentId, isSuperadmin: a.isSuperadmin });

  test("VP manages only mentors of own department, never self", () => {
    expect(canManageUser(me(vpTech, "vp"), user("m", mentorTech))).toBe(true);
    expect(canManageUser(me(vpTech, "vp"), user("m2", { role: "mentor", departmentId: PN, isSuperadmin: false }))).toBe(false);
    expect(canManageUser(me(vpTech, "vp"), user("vp", vpTech))).toBe(false);
  });

  test("CEO manages anyone but a superadmin; superadmin manages superadmins", () => {
    expect(canManageUser(me(ceo, "ceo"), user("sec", secretary))).toBe(true);
    expect(canManageUser(me(ceo, "ceo"), user("sa", superadmin))).toBe(false);
    expect(canManageUser(me(superadmin, "sa1"), user("sa2", superadmin))).toBe(true);
    expect(canManageUser(me(mentorTech, "m"), user("m3", mentorTech))).toBe(false);
  });
});
