import { useEffect, useMemo } from "react";
import type { CellState, SelKey, ShiftMode } from "./shiftVisual";
import type { ShiftTheme } from "./shiftTheme";
import type { GroupSettings, Member, Shift } from "../types";

/** 週・モバイル週の時間軸で、1時間ぶんの高さ。 */
export const HOUR_H = 32;

/** 一覧・月・週で共通して受け取る値。表示ごとの分岐は App 側で行う。 */
export interface ViewCommon {
  anchorDate: Date;
  members: Member[];
  shifts: Shift[];
  currentMemberId: string;
  mode: ShiftMode;
  selected: Set<SelKey>;
  settings: GroupSettings;
  theme: ShiftTheme | null;
  onCellTap: (key: SelKey, state: CellState) => void;
  onToggleMany: (keys: SelKey[]) => void;
  showTimes?: boolean;
  density?: "compact" | "comfortable";
}

/** メンバー×日付でシフトを引けるようにする。キーは `${memberId}__${date}`。 */
export function useStateMap(shifts: Shift[]) {
  return useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.memberId}__${s.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [shifts]);
}

/** 当月を開いたとき、当日の列が見えるよう中央付近へ移動する。 */
export function useCenterToday(
  ref: React.RefObject<HTMLDivElement | null>,
  anchorDate: Date,
  leadingWidth: number,
  dayWidth: number,
) {
  const monthKey = `${anchorDate.getFullYear()}-${anchorDate.getMonth()}`;
  useEffect(() => {
    const today = new Date();
    if (
      today.getFullYear() !== anchorDate.getFullYear() ||
      today.getMonth() !== anchorDate.getMonth()
    ) {
      return;
    }
    const center = () => {
      const node = ref.current;
      if (!node) return;
      node.scrollLeft = Math.max(
        0,
        leadingWidth + (today.getDate() - 1) * dayWidth + dayWidth / 2 - node.clientWidth / 2,
      );
    };
    const timers = [60, 240, 600].map((delay) => window.setTimeout(center, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [anchorDate, dayWidth, leadingWidth, monthKey, ref]);
}
