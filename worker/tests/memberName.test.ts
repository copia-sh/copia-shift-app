import { describe, it, expect } from "vitest";
import { normalizeMemberName, findActiveMemberByName } from "../src/memberName";
import type { FirestoreDocument } from "../src/firestoreRest";

function memberDoc(id: string, data: Record<string, unknown>): FirestoreDocument {
  return { id, data: { active: true, ...data } };
}

describe("normalizeMemberName", () => {
  it("strips surrounding whitespace", () => {
    expect(normalizeMemberName("  田村  ")).toBe("田村");
  });

  it("removes the space between 姓 and 名 so half/full-width variants match", () => {
    expect(normalizeMemberName("田村 翔")).toBe("田村翔");
    expect(normalizeMemberName("田村　翔")).toBe("田村翔");
  });

  it("folds full-width alphanumerics to half-width (NFKC)", () => {
    expect(normalizeMemberName("Ｔａｍｕｒａ")).toBe("tamura");
  });

  it("is case-insensitive for latin names", () => {
    expect(normalizeMemberName("Tamura")).toBe(normalizeMemberName("tamura"));
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeMemberName("  　 ")).toBe("");
  });
});

describe("findActiveMemberByName", () => {
  it("finds the single active member whose displayName matches after normalization", () => {
    const members = [
      memberDoc("u1", { displayName: "田村 翔" }),
      memberDoc("u2", { displayName: "佐藤" }),
    ];
    expect(findActiveMemberByName(members, "田村翔")).toEqual({
      ok: true,
      memberId: "u1",
      displayName: "田村 翔",
    });
  });

  it("reports name_not_found when nobody matches", () => {
    const members = [memberDoc("u1", { displayName: "田村" })];
    expect(findActiveMemberByName(members, "鈴木")).toEqual({ ok: false, reason: "name_not_found" });
  });

  it("reports name_not_found for an empty name instead of matching a blank displayName", () => {
    const members = [memberDoc("u1", { displayName: "  " })];
    expect(findActiveMemberByName(members, "")).toEqual({ ok: false, reason: "name_not_found" });
  });

  it("reports ambiguous_name rather than guessing when two active members share a name", () => {
    const members = [
      memberDoc("u1", { displayName: "田村" }),
      memberDoc("u2", { displayName: "田村" }),
    ];
    expect(findActiveMemberByName(members, "田村")).toEqual({ ok: false, reason: "ambiguous_name" });
  });

  it("ignores members who have left (active:false), so their name is not ambiguous", () => {
    const members = [
      memberDoc("u1", { displayName: "田村" }),
      memberDoc("u2", { displayName: "田村", active: false }),
    ];
    expect(findActiveMemberByName(members, "田村")).toEqual({
      ok: true,
      memberId: "u1",
      displayName: "田村",
    });
  });

  it("ignores documents whose displayName is not a string", () => {
    const members = [memberDoc("u1", { displayName: 42 })];
    expect(findActiveMemberByName(members, "42")).toEqual({ ok: false, reason: "name_not_found" });
  });

  it("rejects a memberId that is not a safe Firestore path segment", () => {
    const members = [memberDoc("../../groups/g2/members/u9", { displayName: "田村" })];
    expect(findActiveMemberByName(members, "田村")).toEqual({ ok: false, reason: "name_not_found" });
  });
});
