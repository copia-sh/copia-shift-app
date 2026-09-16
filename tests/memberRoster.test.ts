import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROSTER_FILTER,
  emptyRosterReason,
  hasActiveFilter,
  nonTargetCount,
  rosterMembers,
  shiftTargetMembers,
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
    shiftTarget: true,
    attributes: [],
    joinedAt: null,
    ...over,
  };
}

const me = member("me", "田村駿貴", { attributes: ["社員"], role: "admin" });
const akama = member("m2", "赤間", { attributes: ["スタダ"] });
const sone = member("m3", "曽根", { attributes: ["スタダ", "パート"] });
const retired = member("m4", "退会者", { active: false });
// 社員。メンバーではあるが、シフト表には載せない
const staff = member("m5", "高橋", { attributes: ["社員"], shiftTarget: false });
const all = [me, akama, sone, retired, staff];

const filter = (over: Partial<RosterFilter> = {}): RosterFilter => ({
  ...DEFAULT_ROSTER_FILTER,
  ...over,
});

describe("shiftTargetMembers", () => {
  it("在籍していて、シフト表の対象になっている人だけを返す", () => {
    expect(shiftTargetMembers(all).map((m) => m.id)).toEqual(["me", "m2", "m3"]);
  });

  it("退会者は対象でも返さない", () => {
    expect(shiftTargetMembers([retired]).map((m) => m.id)).toEqual([]);
  });
});

describe("nonTargetCount", () => {
  it("在籍しているが対象外の人数を数える（退会者は含めない）", () => {
    expect(nonTargetCount(all)).toBe(1);
    expect(nonTargetCount([retired])).toBe(0);
  });
});

describe("rosterMembers", () => {
  it("退会者とシフト表対象外は出さない", () => {
    expect(rosterMembers(all, "me", filter()).map((m) => m.id)).toEqual(["me", "m2", "m3"]);
  });

  it("対象外の人は、属性で絞っても出てこない", () => {
    expect(
      rosterMembers(all, "me", filter({ attributes: new Set(["社員"]) })).map((m) => m.id),
    ).toEqual(["me"]);
  });

  it("対象外の人は、氏名で探しても出てこない", () => {
    expect(rosterMembers(all, "me", filter({ nameQuery: "高橋" }))).toEqual([]);
  });

  it("自分が対象外なら「自分」でも出さない", () => {
    expect(rosterMembers(all, "m5", filter({ showCurrentMemberOnly: true }))).toEqual([]);
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

  it("全員が対象外なら、条件ではなく設定の問題だと伝える", () => {
    expect(emptyRosterReason([staff], "m5", filter())).toBe(
      "シフト表の対象になっているメンバーがいません。メンバー管理で対象を設定してください。",
    );
  });

  it("0件でなければ null", () => {
    expect(emptyRosterReason(all, "me", filter())).toBeNull();
  });
});
