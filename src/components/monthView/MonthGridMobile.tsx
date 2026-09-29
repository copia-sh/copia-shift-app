import { useMemo, useState } from "react";
import { toDateKey } from "../../utils/date";
import {
  DOW_LABELS,
  canTapCell,
  cellStatesOf,
  dowLabelsFrom,
  isSameDate,
  monthGridWeeks,
  selKey,
  type CellState,
} from "../shiftVisual";
import { formatHours } from "../workHours";
import { compactRange, countByType, dayEntries, entryHours, fullRange, type DayEntry } from "./monthDay";
import { dateInk, dowColor, entryStyle, memberInk, skinOf, typeLabel, workingCount } from "./monthShared";
import type { MonthGridProps } from "./MonthGridPC";

const NONE: CellState = { kind: "none", type: "", startTime: null, endTime: null };

function initialDay(anchorDate: Date): Date {
  const today = new Date();
  return today.getFullYear() === anchorDate.getFullYear() && today.getMonth() === anchorDate.getMonth()
    ? today
    : new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
}

/**
 * スマホの月ビュー。小さな月カレンダーで日付を選び、下にその日の内訳を出す。
 * シフトの入力・選択は内訳の行から行う（カレンダーのセルは日付を選ぶだけ）。
 */
export function MonthGridMobile(props: MonthGridProps) {
  // 月を移動したら選択日を選び直す（前の月の日付が残らないように）
  const monthKey = `${props.anchorDate.getFullYear()}-${props.anchorDate.getMonth()}`;
  return <MonthGridMobileInner key={monthKey} {...props} />;
}

function MonthGridMobileInner(props: MonthGridProps) {
  const { anchorDate, members, byKey, settings, theme } = props;
  const [selectedDay, setSelectedDay] = useState(() => initialDay(anchorDate));
  const weeks = useMemo(() => monthGridWeeks(anchorDate, settings.weekStartsOn), [anchorDate, settings.weekStartsOn]);
  const unavailable = theme?.unavailableKeys ?? new Set<string>();
  const memberById = new Map(members.map((member) => [member.id, member]));
  const today = new Date();
  const entriesOn = (dateKey: string) =>
    dayEntries(members, (memberId) => cellStatesOf(byKey.get(selKey(memberId, dateKey)) ?? [], unavailable));

  return (
    <div className="md:hidden">
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        <div className="grid grid-cols-7 border-b border-[#E5E7EB] bg-[#FBFCFD]">
          {dowLabelsFrom(settings.weekStartsOn).map((label, i) => (
            <div key={label} className="py-1 text-center text-[11px] font-bold" style={{ color: dowColor((i + settings.weekStartsOn) % 7) }}>
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={toDateKey(week[0])} className="grid grid-cols-7">
            {week.map((day) => {
              const dateKey = toDateKey(day);
              const inMonth = day.getMonth() === anchorDate.getMonth();
              const isSelected = isSameDate(day, selectedDay);
              const isToday = isSameDate(day, today);
              const entries = entriesOn(dateKey).filter((entry) => entry.typeKeys.some((key) => !unavailable.has(key)));
              return (
                <button
                  key={dateKey}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${day.getMonth() + 1}月${day.getDate()}日 ${entries.length}人`}
                  onClick={() => setSelectedDay(day)}
                  className="flex min-h-16 min-w-0 flex-col gap-0.5 border-b border-r border-[#F1F3F5] p-[3px] text-left last:border-r-0"
                  style={{
                    background: isSelected ? "#EDF6FD" : isToday ? "#FFFBEA" : inMonth ? "#fff" : "#FAFBFC",
                    outline: isSelected ? "2px solid #248DD4" : undefined,
                    outlineOffset: -2,
                  }}
                >
                  <span
                    className={`inline-flex h-4 min-w-4 items-center justify-center self-start text-[11px] font-bold ${isToday && !isSelected ? "rounded-full bg-[#F9E428] px-1" : ""}`}
                    style={{ color: dateInk(day, inMonth) }}
                  >
                    {day.getDate()}
                  </span>
                  {entries.map((entry) => {
                    const member = memberById.get(entry.memberId);
                    if (!member) return null;
                    const skin = skinOf(theme, entry.primary, false);
                    return (
                      <span key={entry.memberId} className="flex h-[15px] min-w-0 items-center justify-between gap-0.5 overflow-hidden rounded-[3px] px-0.5" style={entryStyle(skin, false)}>
                        <span className="text-[10px] font-bold leading-none" style={{ color: memberInk(member) }}>{member.displayName.slice(0, 1)}</span>
                        <span className="truncate text-[9px] font-bold leading-none tracking-[-0.02em]" style={{ color: skin.fg }}>
                          {compactRange(entry.start, entry.end).replace("–", "-")}
                        </span>
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <DayBreakdown {...props} day={selectedDay} entries={entriesOn(toDateKey(selectedDay))} />
    </div>
  );
}

function DayBreakdown({
  day, entries, members, currentMemberId, mode, selected, theme, onCellTap, onToggleMany,
}: MonthGridProps & { day: Date; entries: DayEntry[] }) {
  const unavailable = theme?.unavailableKeys ?? new Set<string>();
  const dateKey = toDateKey(day);
  const memberById = new Map(members.map((member) => [member.id, member]));
  // 自分の行は、シフトが無い日も入力できるよう必ず出す
  const rows: DayEntry[] = entries.some((entry) => entry.memberId === currentMemberId) || !memberById.has(currentMemberId)
    ? entries
    : [...entries, { memberId: currentMemberId, states: [], primary: NONE, start: null, end: null, typeKeys: [] }];
  const summary = countByType(entries, unavailable).map(({ key, count }) => `${typeLabel(theme, [key])} ${count}人`).join("・");
  const bulk = mode !== "single";

  return (
    <section className="px-1 pt-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[15px] font-bold text-[#111827]">
          {day.getMonth() + 1}月{day.getDate()}日（{DOW_LABELS[day.getDay()]}）
        </h3>
        <span className="text-[12px] text-[#6B7280]">{summary || `${workingCount(entries, unavailable)}人`}</span>
        {bulk && (
          <button
            type="button"
            onClick={() => onToggleMany(rows.filter((row) => canTapCell(mode, row.memberId, currentMemberId, row.primary)).map((row) => selKey(row.memberId, dateKey)))}
            className="ml-auto text-[12px] font-bold text-[#248DD4]"
          >
            この日をまとめて選択
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        {rows.length === 0 && <p className="px-3.5 py-4 text-[13px] text-[#4B5563]">この日のシフトはありません</p>}
        {rows.map((row) => {
          const member = memberById.get(row.memberId);
          if (!member) return null;
          const key = selKey(row.memberId, dateKey);
          const isSel = selected.has(key);
          const tappable = canTapCell(mode, row.memberId, currentMemberId, row.primary);
          const skin = skinOf(theme, row.primary, isSel);
          const empty = row.states.length === 0;
          const hours = entryHours(row.states, unavailable);
          return (
            <button
              key={row.memberId}
              type="button"
              disabled={!tappable}
              onClick={() => onCellTap(key, row.primary)}
              className={`flex min-h-[52px] w-full items-center gap-2.5 border-b border-[#F1F3F5] px-3.5 text-left last:border-b-0 ${isSel ? "bg-[#EDF6FD]" : ""}`}
            >
              <span
                aria-hidden
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-bold"
                style={{ background: `color-mix(in srgb, ${member.color} 22%, white)`, color: memberInk(member) }}
              >
                {member.displayName.slice(0, 1)}
              </span>
              <span className="min-w-0 truncate text-[14px] font-bold text-[#111827]">{member.displayName}</span>
              {empty ? (
                <span className="text-[12px] text-[#9CA3AF]">未回答（押して入力）</span>
              ) : (
                <>
                  <span className="inline-flex h-[22px] flex-none items-center rounded-full px-2 text-[11px] font-bold" style={entryStyle(skin, false)}>
                    {typeLabel(theme, row.typeKeys)}
                  </span>
                  <span className="truncate text-[13px] text-[#374151]">{fullRange(row.start, row.end)}</span>
                  {hours > 0 && <span className="ml-auto flex-none text-[14px] font-bold text-[#111827]">{formatHours(hours)}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
