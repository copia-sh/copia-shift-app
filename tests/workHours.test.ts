import { describe, it, expect } from "vitest";
import { summarizeWorkHours, formatHours, paidHoursOfDay } from "../src/components/workHours";
import type { CellState } from "../src/components/shiftVisual";

const unavailable = new Set(["欠勤", "却下"]);

function st(kind: CellState["kind"], type: string, startTime: string | null, endTime: string | null): CellState {
  return { kind, type, startTime, endTime };
}

describe("summarizeWorkHours", () => {
  it("確定と希望の時間をそれぞれ合計する", () => {
    const sum = summarizeWorkHours(
      [
        [st("fixed", "出勤", "09:00", "11:00"), st("fixed", "リモート", "14:00", "16:30")],
        [st("fixed", "出勤", "09:00", "13:00"), st("want", "出勤", "10:00", "12:00")],
      ],
      unavailable,
    );
    expect(sum).toEqual({ fixedHours: 8.5, wantHours: 2, fixedUntimedDays: 0, wantUntimedDays: 0 });
  });

  it("時間なし（終日）の枠は時間に足さず、日数として数える", () => {
    const sum = summarizeWorkHours([[st("fixed", "出勤", null, null)], [st("want", "出勤", null, null)]], unavailable);
    expect(sum).toEqual({ fixedHours: 0, wantHours: 0, fixedUntimedDays: 1, wantUntimedDays: 1 });
  });

  it("不可・却下・未回答は数えない", () => {
    const sum = summarizeWorkHours(
      [[st("no", "欠勤", "09:00", "18:00")], [st("fixed", "欠勤", "09:00", "18:00")], [st("fixed", "却下", null, null)], [st("none", "", null, null)]],
      unavailable,
    );
    expect(sum).toEqual({ fixedHours: 0, wantHours: 0, fixedUntimedDays: 0, wantUntimedDays: 0 });
  });

  it("終了が開始以前の壊れた枠は0時間として扱う", () => {
    expect(summarizeWorkHours([[st("fixed", "出勤", "18:00", "09:00")]], unavailable).fixedHours).toBe(0);
  });
});

describe("休憩控除（1日6時間以上なら1時間引く）", () => {
  it("6時間未満はそのまま、6時間以上は1時間引く", () => {
    expect(paidHoursOfDay(5.5)).toBe(5.5);
    expect(paidHoursOfDay(6)).toBe(5);
    expect(paidHoursOfDay(6.5)).toBe(5.5);
    expect(paidHoursOfDay(7)).toBe(6);
  });

  it("日ごとに判定し、同じ日の複数枠は合算してから判定する", () => {
    const sum = summarizeWorkHours(
      [
        [st("fixed", "出勤", "09:00", "12:00"), st("fixed", "リモート", "13:00", "16:30")], // 6.5h → 5.5h
        [st("fixed", "出勤", "09:00", "14:00")], // 5h → 5h
        [st("want", "出勤", "09:00", "16:00")], // 7h → 6h
      ],
      unavailable,
    );
    expect(sum.fixedHours).toBe(10.5);
    expect(sum.wantHours).toBe(6);
  });

  it("確定と希望は別々に判定する", () => {
    const sum = summarizeWorkHours([[st("fixed", "出勤", "09:00", "13:00"), st("want", "出勤", "13:00", "16:00")]], unavailable);
    expect(sum).toMatchObject({ fixedHours: 4, wantHours: 3 });
  });
});

describe("formatHours", () => {
  it("整数はそのまま、端数は分で表す", () => {
    expect(formatHours(8)).toBe("8時間");
    expect(formatHours(8.5)).toBe("8時間30分");
    expect(formatHours(0.5)).toBe("30分");
    expect(formatHours(0)).toBe("0時間");
  });
});
