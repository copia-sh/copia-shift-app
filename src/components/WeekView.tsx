import { isToday } from "date-fns";
import { HOUR_ROWS, getWeekDays, toDateKey } from "../utils/date";
import { SHIFT_TYPE_STYLE } from "../types";
import type { Member, ShiftEntry } from "../types";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const HOUR_HEIGHT = 48; // px per hour
const START_HOUR = HOUR_ROWS[0];

function timeToOffset(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
}

interface WeekViewProps {
  anchorDate: Date;
  members: Member[];
  entries: ShiftEntry[];
  onOpenEntry: (entry: ShiftEntry, member: Member) => void;
  onCreateAt: (dateKey: string) => void;
}

export function WeekView({
  anchorDate,
  members,
  entries,
  onOpenEntry,
  onCreateAt,
}: WeekViewProps) {
  const days = getWeekDays(anchorDate);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const entriesByDate = new Map<string, ShiftEntry[]>();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header: weekday + date, plus all-day (no time) entries */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1">
        <div />
        {days.map((day) => {
          const dateKey = toDateKey(day);
          const allDayEntries = (entriesByDate.get(dateKey) ?? []).filter(
            (e) => !e.startTime,
          );
          return (
            <div key={dateKey} className="flex flex-col gap-0.5 rounded-t-md bg-gray-50 p-1">
              <div className="text-center text-xs text-gray-500">
                {WEEKDAY_LABELS[day.getDay()]}
              </div>
              <div
                className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                  isToday(day) ? "bg-blue-600 font-semibold text-white" : "text-gray-800"
                }`}
              >
                {day.getDate()}
              </div>
              {allDayEntries.map((entry) => {
                const member = memberById.get(entry.memberId);
                if (!member) return null;
                const style = SHIFT_TYPE_STYLE[entry.type];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onOpenEntry(entry, member)}
                    className="truncate rounded px-1 text-[10px]"
                    style={{
                      backgroundColor: style.bg,
                      color: style.text,
                      border:
                        entry.status === "desired"
                          ? "1px dashed #9ca3af"
                          : "1px solid transparent",
                    }}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1">
        <div className="flex flex-col">
          {HOUR_ROWS.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_HEIGHT }}
              className="pr-1 text-right text-[10px] text-gray-400"
            >
              {hour}:00
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dateKey = toDateKey(day);
          const timedEntries = (entriesByDate.get(dateKey) ?? []).filter(
            (e) => e.startTime && e.endTime,
          );
          return (
            <div
              key={dateKey}
              className="relative cursor-pointer rounded-b-md border border-gray-100 bg-white"
              style={{ height: HOUR_HEIGHT * HOUR_ROWS.length }}
              onClick={() => onCreateAt(dateKey)}
            >
              {HOUR_ROWS.map((hour) => (
                <div
                  key={hour}
                  className="border-t border-gray-100"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}
              {timedEntries.map((entry) => {
                const member = memberById.get(entry.memberId);
                if (!member) return null;
                const style = SHIFT_TYPE_STYLE[entry.type];
                const top = timeToOffset(entry.startTime!);
                const height = Math.max(
                  timeToOffset(entry.endTime!) - top,
                  20,
                );
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEntry(entry, member);
                    }}
                    className="absolute left-0.5 right-0.5 truncate rounded px-1 text-left text-[10px] leading-tight"
                    style={{
                      top,
                      height,
                      backgroundColor: style.bg,
                      color: style.text,
                      border:
                        entry.status === "desired"
                          ? "1px dashed #9ca3af"
                          : "1px solid transparent",
                      opacity: entry.status === "confirmed" ? 1 : 0.85,
                    }}
                  >
                    {member.name} {entry.startTime}-{entry.endTime}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
