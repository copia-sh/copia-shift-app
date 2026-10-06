import { useMemo } from "react";
import type { Member, Shift } from "../../types";
import { toDateKey } from "../../utils/date";
import type { ShiftTheme } from "../shiftTheme";
import { cellStatesOf, daysOfMonth, selKey } from "../shiftVisual";
import { formatHours } from "../workHours";
import { monthTypeTotals } from "./monthDay";
import { memberInk, typeLabel } from "./monthShared";

interface MonthTotalsProps {
  anchorDate: Date;
  members: readonly Member[];
  byKey: ReadonlyMap<string, Shift[]>;
  theme: ShiftTheme | null;
}

/** 月ビューの上に出す、メンバーごとの月の合計（確定＋希望、休憩控除後）。 */
export function MonthTotals({ anchorDate, members, byKey, theme }: MonthTotalsProps) {
  const unavailable = theme?.unavailableKeys ?? new Set<string>();
  const dateKeys = useMemo(() => daysOfMonth(anchorDate).map(toDateKey), [anchorDate]);
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
      {members.map((member) => {
        const days = dateKeys.map((dateKey) => cellStatesOf(byKey.get(selKey(member.id, dateKey)) ?? [], unavailable));
        const totals = monthTypeTotals(days, unavailable);
        const ink = memberInk(member);
        return (
          <span key={member.id} className="inline-flex h-[34px] items-center gap-2 rounded-full border border-line bg-white pl-1 pr-3">
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: `color-mix(in srgb, ${member.color} 22%, white)`, color: ink }}
            >
              {member.displayName.slice(0, 1)}
            </span>
            <span className="text-[12px] font-bold" style={{ color: ink }}>{member.displayName}</span>
            <span className="text-[12px] font-bold text-ink">{formatHours(totals.total)}</span>
            {totals.byType.length > 0 && (
              <span className="text-[11px] text-ink-4">
                {totals.byType.map((item) => `${typeLabel(theme, [item.key])} ${formatHours(item.hours)}`).join("・")}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
