import { isSameMonth, isToday } from "date-fns";
import { getMonthGridDays, toDateKey } from "../utils/date";
import { MemberChip } from "./MemberChip";
import type { Member, ShiftEntry } from "../types";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

interface MonthViewProps {
  anchorDate: Date;
  members: Member[];
  entries: ShiftEntry[];
  selectedDates: Set<string>;
  onToggleDateSelect: (dateKey: string) => void;
  onOpenEntry: (entry: ShiftEntry, member: Member) => void;
}

export function MonthView({
  anchorDate,
  members,
  entries,
  selectedDates,
  onToggleDateSelect,
  onOpenEntry,
}: MonthViewProps) {
  const days = getMonthGridDays(anchorDate);
  const entriesByDate = new Map<string, ShiftEntry[]>();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }
  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateKey = toDateKey(day);
          const dayEntries = entriesByDate.get(dateKey) ?? [];
          const inMonth = isSameMonth(day, anchorDate);
          const selected = selectedDates.has(dateKey);

          return (
            <div
              key={dateKey}
              onClick={() => onToggleDateSelect(dateKey)}
              className={`flex min-h-24 cursor-pointer flex-col gap-0.5 rounded-md border p-1 transition ${
                selected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span
                className={`self-end text-xs ${
                  isToday(day)
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 font-semibold text-white"
                    : "text-gray-500"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEntries.map((entry) => {
                  const member = memberById.get(entry.memberId);
                  if (!member) return null;
                  return (
                    <MemberChip
                      key={entry.id}
                      member={member}
                      entry={entry}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEntry(entry, member);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
