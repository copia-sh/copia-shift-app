import { describe, it, expect } from "vitest";
import {
  compactRange,
  countByType,
  dayEntries,
  entryHours,
  fullRange,
  monthTypeTotals,
} from "../src/components/monthView/monthDay";
import type { CellState } from "../src/components/shiftVisual";

const s = (type: string, startTime: string | null, endTime: string | null, kind: CellState["kind"] = "fixed"): CellState => ({
  kind, type, startTime, endTime,
});
const UNAVAILABLE = new Set(["欠勤", "却下"]);

describe("compactRange / fullRange", () => {
  it("ちょうどの時刻は時だけ、半端は分まで", () => {
    expect(compactRange("10:00", "17:00")).toBe("10–17");
    expect(compactRange("10:30", "17:00")).toBe("10:30–17");
  });

  it("時刻が無ければ終日", () => {
    expect(compactRange(null, null)).toBe("終日");
    expect(fullRange(null, null)).toBe("終日");
  });

  it("詳細は分まで出す", () => {
    expect(fullRange("10:00", "17:00")).toBe("10:00〜17:00");
  });
});

describe("dayEntries", () => {
  const members = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("シフトのある人だけをメンバー順に、最初の開始から最後の終了までで返す", () => {
    const byMember: Record<string, CellState[]> = {
      c: [s("出勤", "09:00", "13:00"), s("リモート", "14:00", "18:00")],
      a: [s("リモート", "10:00", "15:00", "want")],
    };
    const entries = dayEntries(members, (id) => byMember[id] ?? []);
    expect(entries.map((e) => [e.memberId, e.start, e.end, e.typeKeys])).toEqual([
      ["a", "10:00", "15:00", ["リモート"]],
      ["c", "09:00", "18:00", ["出勤", "リモート"]],
    ]);
    expect(entries[1].primary.type).toBe("出勤");
  });
});

describe("entryHours / countByType", () => {
  it("不可を除いた時間を足す", () => {
    expect(entryHours([s("出勤", "09:00", "13:00"), s("リモート", "14:00", "17:30"), s("欠勤", null, null, "no")], UNAVAILABLE)).toBe(7.5);
  });

  it("種別ごとに人数を数える（不可は数えない）", () => {
    const entries = dayEntries([{ id: "a" }, { id: "b" }, { id: "c" }], (id) =>
      ({ a: [s("出勤", "9:00", "10:00")], b: [s("リモート", "9:00", "10:00")], c: [s("欠勤", null, null, "no")] })[id] ?? [],
    );
    expect(countByType(entries, UNAVAILABLE)).toEqual([
      { key: "出勤", count: 1 },
      { key: "リモート", count: 1 },
    ]);
  });
});

describe("monthTypeTotals", () => {
  it("日・種別ごとに6時間以上なら休憩1時間を引いて合計する", () => {
    const days = [
      [s("出勤", "10:00", "17:00")], // 7h → 6h
      [s("リモート", "10:00", "13:00", "want")], // 3h
      [s("欠勤", null, null, "no")],
      [s("出勤", null, null)], // 終日は時間に入れない
    ];
    expect(monthTypeTotals(days, UNAVAILABLE)).toEqual({
      total: 9,
      byType: [
        { key: "出勤", hours: 6 },
        { key: "リモート", hours: 3 },
      ],
    });
  });
});
