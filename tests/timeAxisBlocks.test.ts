import { describe, expect, it } from "vitest";
import { timeAxisBlocks } from "../src/components/weekView/timeAxis";
import type { CellState } from "../src/components/shiftVisual";
import type { Member } from "../src/types";

const member = (id: string, displayName: string): Member => ({
  id,
  email: `${id}@example.com`,
  displayName,
  color: "#248DD4",
  role: "member",
  active: true,
  shiftTarget: true,
  attributes: [],
  joinedAt: null,
});

const state = (
  kind: CellState["kind"],
  startTime: string | null,
  endTime: string | null,
): CellState => ({ kind, type: "出勤", startTime, endTime });

const members = [member("m1", "田村"), member("m2", "赤間")];

describe("timeAxisBlocks", () => {
  it("同じ日の複数枠を1つに絞らない（確定だけ描いて希望を消さない）", () => {
    const blocks = timeAxisBlocks(members, (id) =>
      id === "m1"
        ? [state("fixed", "09:00", "13:00"), state("want", "14:00", "18:00")]
        : [],
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.state.startTime)).toEqual(["09:00", "14:00"]);
  });

  it("重ならない枠は同じレーンに置く（横幅を無駄に割らない）", () => {
    const blocks = timeAxisBlocks([members[0]], () => [
      state("fixed", "09:00", "13:00"),
      state("want", "13:00", "18:00"),
    ]);
    expect(blocks.map((b) => b.lane)).toEqual([0, 0]);
    expect(blocks.every((b) => b.laneCount === 1)).toBe(true);
  });

  it("重なる枠は別レーンに分け、どちらも消さない", () => {
    const blocks = timeAxisBlocks([members[0]], () => [
      state("fixed", "09:00", "13:00"),
      state("want", "10:00", "15:00"),
    ]);
    expect(blocks.map((b) => b.lane)).toEqual([0, 1]);
    expect(blocks.every((b) => b.laneCount === 2)).toBe(true);
  });

  it("終日枠は時間軸に置けないので含めない", () => {
    const blocks = timeAxisBlocks([members[0]], () => [state("want", null, null)]);
    expect(blocks).toHaveLength(0);
  });

  it("不可・却下の枠も落とさない（表示を切り替えて予定が消えない）", () => {
    const blocks = timeAxisBlocks([members[0]], () => [state("no", "09:00", "12:00")]);
    expect(blocks).toHaveLength(1);
  });

  it("人ごとにまとめて返す（どの枠が誰のものか分かる）", () => {
    const blocks = timeAxisBlocks(members, () => [state("want", "09:00", "12:00")]);
    expect(blocks.map((b) => b.member.id)).toEqual(["m1", "m2"]);
  });
});
