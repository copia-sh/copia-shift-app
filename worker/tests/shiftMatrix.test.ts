import { describe, expect, it } from "vitest";
import { buildShiftMatrix, matrixDates } from "../src/shiftMatrix";

const dates = ["2026-09-28", "2026-09-29", "2026-09-30"];

describe("matrixDates", () => {
  it("今日から指定日数ぶんのJST暦日を並べる", () => {
    const result = matrixDates(new Date("2026-09-28T02:00:00Z"), 3);
    expect(result).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("JSTの日付で切る（UTC深夜は翌日扱い）", () => {
    // 2026-09-28T16:00Z = JST 2026-09-29 01:00
    expect(matrixDates(new Date("2026-09-28T16:00:00Z"), 1)).toEqual(["2026-09-29"]);
  });
});

describe("buildShiftMatrix", () => {
  it("1行目に日付、1列目に氏名を並べる", () => {
    const rows = buildShiftMatrix({
      dates,
      names: ["田村駿貴", "赤間"],
      cells: new Map(),
      updatedAt: "2026-09-28 09:00:00 JST",
    });
    expect(rows[0]).toEqual(["更新日時", "2026-09-28 09:00:00 JST", "", ""]);
    expect(rows[1]).toEqual(["氏名", "9/28(月)", "9/29(火)", "9/30(水)"]);
    expect(rows[2]).toEqual(["田村駿貴", "", "", ""]);
    expect(rows[3]).toEqual(["赤間", "", "", ""]);
  });

  it("同じ日の複数枠はカンマ区切りで1セルに入れる", () => {
    const cells = new Map([["田村駿貴\u00002026-09-28", "9:00-13:00,14:00-18:00(リ)"]]);
    const rows = buildShiftMatrix({
      dates,
      names: ["田村駿貴"],
      cells,
      updatedAt: "x",
    });
    expect(rows[2][1]).toBe("9:00-13:00,14:00-18:00(リ)");
  });

  it("シフトの無い日は空欄にする", () => {
    const cells = new Map([["赤間\u00002026-09-30", "終日"]]);
    const rows = buildShiftMatrix({ dates, names: ["赤間"], cells, updatedAt: "x" });
    expect(rows[2]).toEqual(["赤間", "", "", "終日"]);
  });

  it("メンバーがいなくてもヘッダーは書く（前回の行が残らないように）", () => {
    const rows = buildShiftMatrix({ dates, names: [], cells: new Map(), updatedAt: "x" });
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe("氏名");
  });
});
