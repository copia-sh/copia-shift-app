import { describe, it, expect } from "vitest";
import {
  applyTemplateToDraft,
  planTemplateApply,
  previousWeekdaySegments,
  suggestTemplates,
  templateKeyOf,
} from "../src/utils/applyTemplate";
import type { Shift } from "../src/types";

function shift(
  id: string,
  date: string,
  over: Partial<Shift> = {},
): Shift {
  return {
    id,
    memberId: "me",
    date,
    status: "desired",
    type: "出勤",
    startTime: "09:00",
    endTime: "18:00",
    createdBy: "me",
    createdAt: null,
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: null,
    ...over,
  };
}

describe("templateKeyOf", () => {
  it("同じ組み合わせは同じキーになる（順序が違っても）", () => {
    const a = templateKeyOf([
      { type: "出勤", startTime: "09:00", endTime: "13:00" },
      { type: "リモート", startTime: "14:00", endTime: "18:00" },
    ]);
    const b = templateKeyOf([
      { type: "リモート", startTime: "14:00", endTime: "18:00" },
      { type: "出勤", startTime: "09:00", endTime: "13:00" },
    ]);
    expect(a).toBe(b);
  });

  it("時刻が違えば別のキーになる", () => {
    const a = templateKeyOf([{ type: "出勤", startTime: "09:00", endTime: "18:00" }]);
    const b = templateKeyOf([{ type: "出勤", startTime: "10:00", endTime: "18:00" }]);
    expect(a).not.toBe(b);
  });
});

describe("suggestTemplates", () => {
  it("自分の入力から、多い組み合わせを多い順に返す", () => {
    const shifts = [
      shift("a", "2026-09-01"),
      shift("b", "2026-09-02"),
      shift("c", "2026-09-03"),
      shift("d", "2026-09-04", { startTime: "13:00", endTime: "18:00" }),
      shift("e", "2026-09-05", { memberId: "other" }),
    ];
    const templates = suggestTemplates(shifts, "me");
    expect(templates).toHaveLength(2);
    expect(templates[0].usedCount).toBe(3);
    expect(templates[0].segments).toEqual([
      { type: "出勤", startTime: "09:00", endTime: "18:00" },
    ]);
    expect(templates[1].usedCount).toBe(1);
  });

  it("複数枠の組み合わせも1つの型として数える", () => {
    const shifts = [
      shift("a", "2026-09-01", { startTime: "09:00", endTime: "13:00" }),
      shift("b", "2026-09-01", { type: "リモート", startTime: "14:00", endTime: "18:00" }),
      shift("c", "2026-09-08", { startTime: "09:00", endTime: "13:00" }),
      shift("d", "2026-09-08", { type: "リモート", startTime: "14:00", endTime: "18:00" }),
    ];
    const templates = suggestTemplates(shifts, "me");
    expect(templates).toHaveLength(1);
    expect(templates[0].usedCount).toBe(2);
    expect(templates[0].segments).toHaveLength(2);
  });

  it("却下・不可の枠は型にしない", () => {
    const shifts = [shift("a", "2026-09-01", { type: "却下" })];
    expect(suggestTemplates(shifts, "me", new Set(["却下"]))).toHaveLength(0);
  });

  it("上限まで返す", () => {
    const shifts = Array.from({ length: 5 }, (_, i) =>
      shift(`s${i}`, `2026-09-0${i + 1}`, { startTime: `0${i + 6}:00`, endTime: "18:00" }),
    );
    expect(suggestTemplates(shifts, "me", new Set(), 2)).toHaveLength(2);
  });
});

describe("previousWeekdaySegments", () => {
  const shifts = [
    shift("a", "2026-09-08", { startTime: "09:00", endTime: "13:00" }),
    shift("b", "2026-09-08", { type: "リモート", startTime: "14:00", endTime: "18:00" }),
    shift("c", "2026-09-09"),
  ];

  it("1週間前の同じ曜日の枠を返す", () => {
    const result = previousWeekdaySegments(shifts, "me", "2026-09-15");
    expect(result).toEqual([
      { type: "出勤", startTime: "09:00", endTime: "13:00" },
      { type: "リモート", startTime: "14:00", endTime: "18:00" },
    ]);
  });

  it("1週間前が空なら、さらに前の同じ曜日をたどる", () => {
    const result = previousWeekdaySegments(shifts, "me", "2026-09-22");
    expect(result).toEqual([
      { type: "出勤", startTime: "09:00", endTime: "13:00" },
      { type: "リモート", startTime: "14:00", endTime: "18:00" },
    ]);
  });

  it("見つからなければ null", () => {
    // 2026-09-17 の1週間前は 09-10。そこには何も無い
    expect(previousWeekdaySegments(shifts, "me", "2026-09-17", 1)).toBeNull();
  });

  it("他人の枠は使わない", () => {
    expect(previousWeekdaySegments(shifts, "other", "2026-09-15")).toBeNull();
  });
});

describe("planTemplateApply", () => {
  const segments = [{ type: "出勤", startTime: "09:00", endTime: "18:00" }];

  it("空いている日には新規作成する", () => {
    const plan = planTemplateApply({
      memberId: "me",
      dates: ["2026-09-21", "2026-09-22"],
      segments,
      existingByDate: new Map(),
      maxSegments: 4,
    });
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0]).toEqual({
      kind: "create",
      memberId: "me",
      date: "2026-09-21",
      type: "出勤",
      startTime: "09:00",
      endTime: "18:00",
    });
    expect(plan.skipped).toHaveLength(0);
  });

  it("既に同じ内容の日は書き込まない", () => {
    const plan = planTemplateApply({
      memberId: "me",
      dates: ["2026-09-21"],
      segments,
      existingByDate: new Map([["2026-09-21", [shift("a", "2026-09-21")]]]),
      maxSegments: 4,
    });
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("すでに同じ内容です");
  });

  it("未確定の枠は置き換える", () => {
    const plan = planTemplateApply({
      memberId: "me",
      dates: ["2026-09-21"],
      segments,
      existingByDate: new Map([
        ["2026-09-21", [shift("a", "2026-09-21", { startTime: "13:00", endTime: "20:00" })]],
      ]),
      maxSegments: 4,
    });
    expect(plan.actions).toEqual([
      {
        kind: "update",
        shiftId: "a",
        updates: { type: "出勤", startTime: "09:00", endTime: "18:00" },
      },
    ]);
  });

  it("確定済みを含む日は書き換えず、理由を返す", () => {
    const plan = planTemplateApply({
      memberId: "me",
      dates: ["2026-09-21"],
      segments,
      existingByDate: new Map([
        ["2026-09-21", [shift("a", "2026-09-21", { status: "confirmed" })]],
      ]),
      maxSegments: 4,
    });
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("確定済みのため変更できません");
  });

  it("枠数の上限を超える日は書き込まない", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      type: "出勤",
      startTime: `${String(9 + i).padStart(2, "0")}:00`,
      endTime: `${String(10 + i).padStart(2, "0")}:00`,
    }));
    const plan = planTemplateApply({
      memberId: "me",
      dates: ["2026-09-21"],
      segments: many,
      existingByDate: new Map(),
      maxSegments: 4,
    });
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain("最大4件");
  });
});

describe("applyTemplateToDraft", () => {
  it("既存の行のIDを位置で引き継ぐ", () => {
    const draft = [{ id: "a", type: "出勤", startTime: null, endTime: null }];
    const next = applyTemplateToDraft(draft, [
      { type: "リモート", startTime: "09:00", endTime: "13:00" },
      { type: "出勤", startTime: "14:00", endTime: "18:00" },
    ]);
    expect(next[0].id).toBe("a");
    expect(next[0].type).toBe("リモート");
    expect(next[1].id).toBeUndefined();
  });
});
