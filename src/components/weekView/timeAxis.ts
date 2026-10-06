import { timeAxisLanes, type CellState } from "../shiftVisual";
import type { Member } from "../../types";

export interface TimeAxisBlock {
  member: Member;
  state: CellState;
  /** その人の枠の中での重なり位置 */
  lane: number;
  laneCount: number;
}

/**
 * 1日ぶんの時間軸に置く枠を、人ごとに**すべて**集める。
 *
 * 以前は「確定を優先して1枠だけ」描いていたため、同じ日の2枠目以降が消えていた。
 * 枠はデータの単位なので、表示でも落とさない。重なる枠は人の列の中でレーンに分ける。
 */
export function timeAxisBlocks(
  members: readonly Member[],
  statesOf: (memberId: string) => CellState[],
): TimeAxisBlock[] {
  return members.flatMap((member) => {
    const { boxes, laneCount } = timeAxisLanes(statesOf(member.id));
    return boxes.map(({ state, lane }) => ({ member, state, lane, laneCount }));
  });
}

