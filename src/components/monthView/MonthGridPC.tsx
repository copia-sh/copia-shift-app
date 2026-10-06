import { useMemo } from "react";
import type { GroupSettings, Member, Shift } from "../../types";
import { toDateKey } from "../../utils/date";
import type { ShiftTheme } from "../shiftTheme";
import {
  canTapCell,
  cellStatesOf,
  dowLabelsFrom,
  isSameDate,
  monthGridWeeks,
  selKey,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "../shiftVisual";
import { compactRange, dayEntries } from "./monthDay";
import { dateInk, dowColor, entryStyle, memberInk, skinOf, typeLabel, workingCount, SELECTED_RING } from "./monthShared";
import { COLOR } from "../../theme/palette";

export interface MonthGridProps {
  anchorDate: Date;
  members: readonly Member[];
  byKey: ReadonlyMap<string, Shift[]>;
  currentMemberId: string;
  mode: ShiftMode;
  selected: ReadonlySet<SelKey>;
  settings: GroupSettings;
  theme: ShiftTheme | null;
  onCellTap: (key: SelKey, state: CellState) => void;
  onToggleMany: (keys: SelKey[]) => void;
}

const NONE: CellState = { kind: "none", type: "", startTime: null, endTime: null };

/**
 * PC の月ビュー。日付セルに、その日シフトがある人を「名前・種別・時間」の1行ずつで並べる。
 * 色はテーマのまま（実線＝確定、破線＝希望）。自分の空いている日には入力用の「＋ 自分」を出す。
 */
export function MonthGridPC({
  anchorDate, members, byKey, currentMemberId, mode, selected, settings, theme, onCellTap, onToggleMany,
}: MonthGridProps) {
  const weeks = useMemo(() => monthGridWeeks(anchorDate, settings.weekStartsOn), [anchorDate, settings.weekStartsOn]);
  const unavailable = theme?.unavailableKeys ?? new Set<string>();
  const memberById = new Map(members.map((member) => [member.id, member]));
  const me = memberById.get(currentMemberId);
  const today = new Date();
  const bulk = mode !== "single";

  return (
    <div className="hidden overflow-hidden rounded-xl border border-line bg-white md:block">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {dowLabelsFrom(settings.weekStartsOn).map((label, i) => (
          <div key={label} className="flex h-[30px] items-center justify-center text-[12px] font-bold" style={{ color: dowColor((i + settings.weekStartsOn) % 7) }}>
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={toDateKey(week[0])} className="grid grid-cols-7">
          {week.map((day) => {
            const dateKey = toDateKey(day);
            const inMonth = day.getMonth() === anchorDate.getMonth();
            const isToday = isSameDate(day, today);
            const statesOf = (memberId: string) => cellStatesOf(byKey.get(selKey(memberId, dateKey)) ?? [], unavailable);
            const entries = dayEntries(members, statesOf);
            const working = workingCount(entries, unavailable);
            const myKey = selKey(currentMemberId, dateKey);
            const showAddMine = inMonth && me && !entries.some((entry) => entry.memberId === currentMemberId)
              && canTapCell(mode, currentMemberId, currentMemberId, NONE);
            const selectAll = () => onToggleMany(
              members
                .filter((member) => canTapCell(mode, member.id, currentMemberId, entries.find((e) => e.memberId === member.id)?.primary ?? NONE))
                .map((member) => selKey(member.id, dateKey)),
            );
            return (
              <div
                key={dateKey}
                className="group flex min-h-[120px] flex-col gap-1 border-b border-r border-line-3 p-1.5 last:border-r-0"
                style={{ background: isToday ? COLOR.todayWash2 : inMonth ? COLOR.surface : COLOR.surface3 }}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span
                    className={`inline-flex h-[22px] min-w-[22px] items-center justify-center text-[13px] font-bold ${isToday ? "rounded-full bg-today px-1.5" : ""}`}
                    style={{ color: dateInk(day, inMonth) }}
                  >
                    {day.getDate()}
                  </span>
                  {bulk && inMonth ? (
                    <button type="button" onClick={selectAll} title="この日をまとめて選択" className="rounded px-1 text-[11px] font-bold text-brand hover:bg-brand-wash">
                      {working}人 ▸選択
                    </button>
                  ) : (
                    working > 0 && <span className="text-[11px] text-ink-4">{working}人</span>
                  )}
                </div>
                {entries.map((entry) => {
                  const member = memberById.get(entry.memberId);
                  if (!member) return null;
                  const key = selKey(entry.memberId, dateKey);
                  const isSel = selected.has(key);
                  const skin = skinOf(theme, entry.primary, isSel);
                  const tappable = canTapCell(mode, entry.memberId, currentMemberId, entry.primary);
                  const unavailableOnly = entry.typeKeys.every((k) => unavailable.has(k));
                  return (
                    <button
                      key={entry.memberId}
                      type="button"
                      disabled={!tappable}
                      onClick={() => onCellTap(key, entry.primary)}
                      className={`flex h-[26px] w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left ${tappable ? "" : "cursor-default"}`}
                      style={entryStyle(skin, isSel)}
                    >
                      <span className="truncate text-[12px] font-bold" style={{ color: memberInk(member) }}>{member.displayName}</span>
                      <span className="flex-none text-[11px] font-bold" style={{ color: skin.fg }}>{typeLabel(theme, entry.typeKeys)}</span>
                      {!unavailableOnly && (
                        <span className="ml-auto flex-none text-[11px] text-ink-2">{compactRange(entry.start, entry.end)}</span>
                      )}
                    </button>
                  );
                })}
                {showAddMine && (
                  <button
                    type="button"
                    onClick={() => onCellTap(myKey, NONE)}
                    // 空いている日すべてに出すとうるさいので、セルに乗せたとき・フォーカス時・選択中だけ見せる
                    className={`flex h-[26px] w-full items-center rounded-md border border-dashed border-line px-1.5 text-[11px] text-ink-5 hover:border-brand-line hover:text-brand focus:opacity-100 group-hover:opacity-100 ${
                      selected.has(myKey) ? "opacity-100" : "opacity-0"
                    }`}
                    style={selected.has(myKey) ? { boxShadow: SELECTED_RING, color: COLOR.brand } : undefined}
                  >
                    ＋ 自分
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
