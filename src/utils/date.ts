import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const DATE_FORMAT = "yyyy-MM-dd";

export function toDateKey(date: Date): string {
  return format(date, DATE_FORMAT);
}

/** All the day cells needed to render a full Google-Calendar-style month grid (Sun-Sat weeks). */
export function getMonthGridDays(monthAnchor: Date): Date[] {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let current = gridStart;
  while (current <= gridEnd) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

export function getWeekDays(weekAnchor: Date): Date[] {
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function nextMonth(anchor: Date): Date {
  return addMonths(anchor, 1);
}

export function previousMonth(anchor: Date): Date {
  return addMonths(anchor, -1);
}

export function nextWeek(anchor: Date): Date {
  return addWeeks(anchor, 1);
}

export function previousWeek(anchor: Date): Date {
  return addWeeks(anchor, -1);
}

export const HOUR_ROWS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00-20:00

export function timeOptions(): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      options.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );
    }
  }
  return options;
}
