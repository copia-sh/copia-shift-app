import { describe, it, expect } from "vitest";
import {
  segmentLayout,
  cellBoxes,
  validateSegments,
  isSimpleCell,
  type CellState,
} from "../src/components/shiftVisual";

function makeState(type: string, startTime: string | null, endTime: string | null): CellState {
  return { kind: "want", type: type as any, startTime, endTime };
}

describe("segmentLayout", () => {
  it("終日枠が leftPct:0 / widthPct:100 になる", () => {
    const states = [makeState("出勤", null, null)];
    const boxes = segmentLayout(states);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].leftPct).toBe(0);
    expect(boxes[0].widthPct).toBe(100);
  });

  it("9-13 が左半分寄り、13-18 が右寄りになり、両者が重ならない", () => {
    const states = [makeState("出勤", "09:00", "13:00"), makeState("リモート", "13:00", "18:00")];
    const boxes = segmentLayout(states);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].leftPct).toBe(0);
    expect(boxes[0].leftPct + boxes[0].widthPct).toBeLessThanOrEqual(boxes[1].leftPct);
    expect(boxes[1].leftPct + boxes[1].widthPct).toBeLessThanOrEqual(100);
  });

  it("表示時間帯外（例 6:00-8:00）が 0..100 に丸められる", () => {
    const states = [makeState("出勤", "06:00", "08:00")];
    const boxes = segmentLayout(states, 9, 20);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].leftPct).toBe(0);
    expect(boxes[0].widthPct).toBeGreaterThan(0);
  });

  it("極端に短い枠（9:00-9:15）でも widthPct が 6 以上になる", () => {
    const states = [makeState("出勤", "09:00", "09:15")];
    const boxes = segmentLayout(states);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].widthPct).toBeGreaterThanOrEqual(6);
  });

  it("複数セグメントが leftPct の昇順で返される", () => {
    const states = [
      makeState("出勤", "15:00", "18:00"),
      makeState("リモート", "09:00", "12:00"),
      makeState("欠勤", "13:00", "15:00"),
    ];
    const boxes = segmentLayout(states);
    expect(boxes).toHaveLength(3);
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i].leftPct).toBeLessThanOrEqual(boxes[i + 1].leftPct);
    }
  });
});

describe("validateSegments", () => {
  it("正常なセグメントは null を返す", () => {
    const segments = [{ startTime: "09:00", endTime: "13:00" }];
    expect(validateSegments(segments)).toBeNull();
  });

  it("開始が終了以降の場合、正しいメッセージを返す", () => {
    const segments = [{ startTime: "13:00", endTime: "09:00" }];
    const msg = validateSegments(segments);
    expect(msg).toBe("終了時刻は開始時刻より後にしてください");
  });

  it("終日枠が2つ以上の場合、正しいメッセージを返す", () => {
    const segments = [
      { startTime: null, endTime: null },
      { startTime: null, endTime: null },
    ];
    const msg = validateSegments(segments);
    expect(msg).toBe("終日の枠は1つまでです");
  });

  it("終日枠と時間枠が混在の場合、正しいメッセージを返す", () => {
    const segments = [
      { startTime: null, endTime: null },
      { startTime: "09:00", endTime: "13:00" },
    ];
    const msg = validateSegments(segments);
    expect(msg).toBe("終日の枠と時間指定の枠は同時に登録できません");
  });

  it("時間枠どうしが重なる場合、正しいメッセージを返す", () => {
    const segments = [
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "12:00", endTime: "15:00" },
    ];
    const msg = validateSegments(segments);
    expect(msg).toBe("時間帯が重なっています");
  });

  it("9-13 と 13-18 が重なりと判定されない（接するだけ）", () => {
    const segments = [
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "13:00", endTime: "18:00" },
    ];
    expect(validateSegments(segments)).toBeNull();
  });

  it("件数が max を超える場合、正しいメッセージを返す", () => {
    const segments = [
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "10:00", endTime: "11:00" },
      { startTime: "11:00", endTime: "12:00" },
      { startTime: "12:00", endTime: "13:00" },
      { startTime: "13:00", endTime: "14:00" },
    ];
    const msg = validateSegments(segments, 4);
    expect(msg).toBe("1日に登録できる枠は最大4件です");
  });
});

describe("isSimpleCell", () => {
  it("0件のセルは true を返す", () => {
    expect(isSimpleCell([])).toBe(true);
  });

  it("終日枠1件のセルは true を返す", () => {
    const states = [makeState("出勤", null, null)];
    expect(isSimpleCell(states)).toBe(true);
  });

  it("時間枠がある場合は false を返す", () => {
    const states = [makeState("出勤", "09:00", "13:00")];
    expect(isSimpleCell(states)).toBe(false);
  });

  it("2件以上のセルは false を返す", () => {
    const states = [
      makeState("出勤", null, null),
      makeState("リモート", "13:00", "18:00"),
    ];
    expect(isSimpleCell(states)).toBe(false);
  });
});

describe("segmentLayout: セルからはみ出さないこと", () => {
  // 監査で見つかった回帰: 最小幅を足す際に左端を引き戻していなかったため、
  // 表示時間帯の外に出た枠で leftPct + widthPct が 100 を超えていた。
  it("表示時間帯より後ろの枠でも右端をはみ出さない", () => {
    const [box] = segmentLayout([makeState("出勤", "20:30", "21:30")], 9, 20);
    expect(box.leftPct + box.widthPct).toBeLessThanOrEqual(100);
    expect(box.widthPct).toBeGreaterThanOrEqual(6);
  });

  it("表示時間帯より前の枠でも左端をはみ出さない", () => {
    const [box] = segmentLayout([makeState("出勤", "06:00", "08:00")], 9, 20);
    expect(box.leftPct).toBeGreaterThanOrEqual(0);
    expect(box.leftPct + box.widthPct).toBeLessThanOrEqual(100);
  });

  it("どの枠も 0..100 の範囲に収まる", () => {
    const boxes = segmentLayout(
      [
        makeState("出勤", "06:00", "07:00"),
        makeState("リモート", "09:00", "13:00"),
        makeState("欠勤", "19:30", "23:00"),
      ],
      9,
      20,
    );
    for (const b of boxes) {
      expect(b.leftPct).toBeGreaterThanOrEqual(0);
      expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100);
    }
  });
});

describe("cellBoxes: 1件のときは従来どおりセル全体を埋める", () => {
  it("時間帯を持つ枠が1件だけならセル全体を埋める", () => {
    const boxes = cellBoxes([makeState("出勤", "09:00", "13:00")], 9, 20);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].leftPct).toBe(0);
    expect(boxes[0].widthPct).toBe(100);
  });

  it("終日枠1件でもセル全体を埋める", () => {
    const boxes = cellBoxes([makeState("出勤", null, null)], 9, 20);
    expect(boxes[0].widthPct).toBe(100);
  });

  it("2件以上なら時間比率で分割する", () => {
    const boxes = cellBoxes(
      [makeState("出勤", "09:00", "13:00"), makeState("リモート", "13:00", "18:00")],
      9,
      20,
    );
    expect(boxes).toHaveLength(2);
    expect(boxes[0].widthPct).toBeLessThan(100);
    // 隣り合う枠が重ならない
    expect(boxes[0].leftPct + boxes[0].widthPct).toBeLessThanOrEqual(boxes[1].leftPct + 0.001);
  });

  it("空なら空を返す", () => {
    expect(cellBoxes([], 9, 20)).toEqual([]);
  });
});
