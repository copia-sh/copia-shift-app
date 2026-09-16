import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROSTER_FILTER,
  emptyRosterReason,
  hasActiveFilter,
  rosterMembers,
  type RosterFilter,
} from "../src/components/memberRoster";
import type { Member } from "../src/types";

function member(id: string, displayName: string, over: Partial<Member> = {}): Member {
  return {
    id,
    email: `${id}@example.com`,
    displayName,
    color: "#248DD4",
    role: "member",
    active: true,
    attributes: [],
    joinedAt: null,
    ...over,
  };
}

const me = member("me", "田村駿貴", { attributes: ["社員"], role: "admin" });
const akama = member("m2", "赤間", { attributes: ["スタダ"] });
const sone = member("m3", "曽根", { attributes: ["スタダ", "パート"] });
const retired = member("m4", "退会者", { active: false });
const all = [me, akama, sone, retired];

const filter = (over: Partial<RosterFilter> = {}): RosterFilter => ({
  ...DEFAULT_ROSTER_FILTER,
  ...over,
});

describe("rosterMembers", () => {
  it("退会者は出さない", () => {
    expect(rosterMembers(all, "me", filter()).map((m) => m.id)).toEqual(["me", "m2", "m3"]);
  });

  it("属性はOR条件で絞る", () => {
    expect(
      rosterMembers(all, "me", filter({ attributes: new Set(["パート"]) })).map((m) => m.id),
    ).toEqual(["m3"]);
  });

  it("氏名の部分一致で絞る（前後の空白は無視する）", () => {
    expect(rosterMembers(all, "me", filter({ nameQuery: "  赤  " })).map((m) => m.id)).toEqual([
      "m2",
    ]);
  });

  it("属性と氏名は同時に効く", () => {
    const result = rosterMembers(
      all,
      "me",
      filter({ attributes: new Set(["スタダ"]), nameQuery: "曽根" }),
    );
    expect(result.map((m) => m.id)).toEqual(["m3"]);
  });

  it("「自分」は属性・氏名の条件より優先する", () => {
    const result = rosterMembers(
      all,
      "me",
      filter({ showCurrentMemberOnly: true, attributes: new Set(["スタダ"]), nameQuery: "赤" }),
    );
    expect(result.map((m) => m.id)).toEqual(["me"]);
  });
});

describe("hasActiveFilter", () => {
  it("条件がかかっているかを返す", () => {
    expect(hasActiveFilter(filter())).toBe(false);
    expect(hasActiveFilter(filter({ nameQuery: " " }))).toBe(false);
    expect(hasActiveFilter(filter({ nameQuery: "赤" }))).toBe(true);
    expect(hasActiveFilter(filter({ attributes: new Set(["社員"]) }))).toBe(true);
    expect(hasActiveFilter(filter({ showCurrentMemberOnly: true }))).toBe(true);
  });
});

describe("emptyRosterReason", () => {
  it("条件のせいで0件なら、その理由を返す", () => {
    expect(emptyRosterReason(all, "me", filter({ nameQuery: "存在しない名前" }))).toBe(
      "条件に合うメンバーがいません。属性や氏名の条件を外すと表示されます。",
    );
  });

  it("在籍者がいなければ、条件ではなくその事実を返す", () => {
    expect(emptyRosterReason([retired], "me", filter())).toBe("在籍しているメンバーがいません。");
  });

  it("0件でなければ null", () => {
    expect(emptyRosterReason(all, "me", filter())).toBeNull();
  });
});
