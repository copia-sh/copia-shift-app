import { describe, it, expect } from "vitest";
import {
  shiftTargetMembers,
  rosterMembers,
  rosterCounts,
  emptyRosterReason,
  DEFAULT_ROSTER_FILTER,
  type RosterFilter,
} from "../src/components/memberRoster";
import type { Member } from "../src/types";

function member(
  id: string,
  displayName: string,
  over: Partial<Member> = {},
): Member {
  return {
    id,
    email: `${id}@example.com`,
    displayName,
    color: "#248DD4",
    role: "member",
    active: true,
    attributes: [],
    joinedAt: null,
    shiftTarget: true,
    ...over,
  };
}

const me = member("me", "田村駿貴", { attributes: ["社員"], shiftTarget: false, role: "admin" });
const akama = member("m2", "赤間", { attributes: ["スタダ"] });
const sone = member("m3", "曽根", { attributes: ["スタダ", "パート"] });
const sato = member("m4", "佐藤", { attributes: ["社員"], shiftTarget: false });
const retired = member("m5", "退会者", { active: false });
const all = [me, akama, sone, sato, retired];

const filter = (over: Partial<RosterFilter> = {}): RosterFilter => ({
  ...DEFAULT_ROSTER_FILTER,
  ...over,
});

describe("shiftTargetMembers", () => {
  it("在籍していてシフト対象のメンバーだけを返す", () => {
    expect(shiftTargetMembers(all).map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("退会者はシフト対象でも含めない", () => {
    expect(shiftTargetMembers([retired])).toEqual([]);
  });
});

describe("rosterMembers", () => {
  it("既定ではシフト対象外を出さない", () => {
    expect(rosterMembers(all, "me", filter()).map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("「対象外を表示」がオンのときだけ対象外の行を出す", () => {
    expect(rosterMembers(all, "me", filter({ includeNonTargets: true })).map((m) => m.id)).toEqual([
      "me",
      "m2",
      "m3",
      "m4",
    ]);
  });

  it("属性はOR条件で絞る", () => {
    const result = rosterMembers(all, "me", filter({ attributes: new Set(["パート"]) }));
    expect(result.map((m) => m.id)).toEqual(["m3"]);
  });

  it("氏名の部分一致で絞る（前後の空白は無視する）", () => {
    const result = rosterMembers(all, "me", filter({ nameQuery: "  赤  " }));
    expect(result.map((m) => m.id)).toEqual(["m2"]);
  });

  it("属性と氏名は同時に効く", () => {
    const result = rosterMembers(
      all,
      "me",
      filter({ attributes: new Set(["スタダ"]), nameQuery: "曽根" }),
    );
    expect(result.map((m) => m.id)).toEqual(["m3"]);
  });

  it("「自分」は、自分がシフト対象外でも自分を出す", () => {
    const result = rosterMembers(all, "me", filter({ showCurrentMemberOnly: true }));
    expect(result.map((m) => m.id)).toEqual(["me"]);
  });

  it("「自分」のときは属性・氏名の条件を無視する", () => {
    const result = rosterMembers(
      all,
      "me",
      filter({ showCurrentMemberOnly: true, attributes: new Set(["スタダ"]), nameQuery: "赤" }),
    );
    expect(result.map((m) => m.id)).toEqual(["me"]);
  });
});

describe("rosterCounts", () => {
  it("表示人数とシフト対象外の人数を別々に数える", () => {
    const counts = rosterCounts(all, "me", filter());
    expect(counts.visible).toBe(2);
    expect(counts.nonTarget).toBe(2);
  });

  it("対象外の人数は在籍者だけを数える", () => {
    const counts = rosterCounts([me, retired], "me", filter());
    expect(counts.nonTarget).toBe(1);
  });
});

describe("emptyRosterReason", () => {
  it("選んだ属性が全員シフト対象外なら、その理由を返す", () => {
    const reason = emptyRosterReason(all, "me", filter({ attributes: new Set(["社員"]) }));
    expect(reason).toBe("「社員」はシフト対象外に設定されているため、この表には出ません。");
  });

  it("属性を複数選んでいるときは名前を並べる", () => {
    const reason = emptyRosterReason(
      [me, sato],
      "me",
      filter({ attributes: new Set(["社員", "パート"]) }),
    );
    expect(reason).toContain("「社員」");
  });

  it("それ以外の0件は条件の説明を返す", () => {
    const reason = emptyRosterReason(all, "me", filter({ nameQuery: "存在しない名前" }));
    expect(reason).toBe("条件に合うメンバーがいません。属性や氏名の条件を外すと表示されます。");
  });

  it("0件でなければ null", () => {
    expect(emptyRosterReason(all, "me", filter())).toBeNull();
  });
});
