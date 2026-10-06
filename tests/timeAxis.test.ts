import { describe, it, expect } from "vitest";
import { timeAxisLanes, type CellState } from "../src/components/shiftVisual";

function state(
  kind: CellState["kind"],
  type: string,
  startTime: string | null,
  endTime: string | null,
): CellState {
  return { kind, type, startTime, endTime };
}

describe("timeAxisLanes", () => {
  it("時間指定のない枠（終日）は時間軸に載せない", () => {
    const layout = timeAxisLanes([state("want", "出勤", null, null)]);
    expect(layout.boxes).toHaveLength(0);
    expect(layout.laneCount).toBe(0);
  });

  it("確定と希望が同じ日にあっても、両方とも描画対象になる", () => {
    const layout = timeAxisLanes([
      state("fixed", "出勤", "09:00", "13:00"),
      state("want", "リモート", "13:00", "18:00"),
    ]);
    expect(layout.boxes).toHaveLength(2);
    expect(layout.boxes.map((b) => b.state.type)).toEqual(["出勤", "リモート"]);
  });

  it("重ならない枠は同じレーンに並べる（横幅を無駄に割らない）", () => {
    const layout = timeAxisLanes([
      state("want", "出勤", "09:00", "13:00"),
      state("want", "リモート", "13:00", "18:00"),
    ]);
    expect(layout.laneCount).toBe(1);
    expect(layout.boxes.map((b) => b.lane)).toEqual([0, 0]);
  });

  it("重なる枠は別レーンに分け、どちらも消さない", () => {
    const layout = timeAxisLanes([
      state("fixed", "出勤", "09:00", "13:00"),
      state("want", "リモート", "10:00", "15:00"),
    ]);
    expect(layout.laneCount).toBe(2);
    expect(layout.boxes.map((b) => b.lane)).toEqual([0, 1]);
  });

  it("開始時刻の早い順に返す", () => {
    const layout = timeAxisLanes([
      state("want", "出勤", "15:00", "18:00"),
      state("want", "リモート", "09:00", "12:00"),
    ]);
    expect(layout.boxes.map((b) => b.state.startTime)).toEqual(["09:00", "15:00"]);
  });

  it("不可・却下の枠も時間軸から落とさない", () => {
    const layout = timeAxisLanes([state("no", "却下", "09:00", "12:00")]);
    expect(layout.boxes).toHaveLength(1);
  });

  it("6枠まで、すべて保持する", () => {
    const states = Array.from({ length: 6 }, (_, i) =>
      state("want", "出勤", `${String(9 + i).padStart(2, "0")}:00`, `${String(10 + i).padStart(2, "0")}:00`),
    );
    const layout = timeAxisLanes(states);
    expect(layout.boxes).toHaveLength(6);
    expect(layout.laneCount).toBe(1);
  });
});
