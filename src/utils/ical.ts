import type { Shift } from "../types";

export interface IcalEvent {
  uid: string;
  summary: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" | null. Both null means all-day event */
  startTime: string | null;
  endTime: string | null;
}

/** RFC 5545 text escaping for backslash, semicolon, comma, newline */
export function escapeIcalText(s: string): string {
  return s
    .replace(/\\/g, "\\\\") // backslash first
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Fold line at 75 octets (continuation lines start with space) */
export function foldIcalLine(line: string): string {
  // For line folding, we need to count octets, not characters
  // JavaScript strings use UTF-16, but iCalendar uses UTF-8 octets
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);

  if (bytes.length <= 75) {
    return line;
  }

  const lines: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;

    if (currentBytes + charBytes > 75) {
      // Start new line with space prefix
      if (current) lines.push(current);
      current = " " + char;
      currentBytes = charBytes + 1; // +1 for space
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  if (current) lines.push(current);

  return lines.join("\r\n");
}

export interface BuildIcalendarOpts {
  calendarName?: string;
  now?: Date;
}

/** Build RFC 5545 iCalendar string from events */
export function buildIcalendar(events: IcalEvent[], opts?: BuildIcalendarOpts): string {
  const calendarName = opts?.calendarName ?? "Copia";
  const now = opts?.now ?? new Date();

  // Format current time in UTC: YYYYMMDDTHHMMSSZ
  const pad = (n: number) => String(n).padStart(2, "0");
  const utcDate = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Copia//Shift//JA",
    "CALSCALE:GREGORIAN",
  ];

  if (calendarName) {
    lines.push(`X-WR-CALNAME:${escapeIcalText(calendarName)}`);
  }

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${utcDate}`);

    // SUMMARY line needs escaping and folding
    const summaryLine = `SUMMARY:${escapeIcalText(event.summary)}`;
    lines.push(foldIcalLine(summaryLine));

    if (event.startTime === null && event.endTime === null) {
      // All-day event
      const [year, month, day] = event.date.split("-").map(Number);
      const dateStr = `${year}${pad(month)}${pad(day)}`;
      const nextDate = new Date(year, month - 1, day + 1);
      const nextDateStr = `${nextDate.getFullYear()}${pad(nextDate.getMonth() + 1)}${pad(nextDate.getDate())}`;

      lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
      lines.push(`DTEND;VALUE=DATE:${nextDateStr}`);
    } else {
      // Timed event
      const [year, month, day] = event.date.split("-").map(Number);
      const dateStr = `${year}${pad(month)}${pad(day)}`;

      const [startHour, startMin] = (event.startTime ?? "00:00").split(":").map(Number);
      const [endHour, endMin] = (event.endTime ?? "00:00").split(":").map(Number);

      const startStr = `${dateStr}T${pad(startHour)}${pad(startMin)}00`;
      let endStr = `${dateStr}T${pad(endHour)}${pad(endMin)}00`;

      // If end time <= start time, move end to next day
      if (endHour < startHour || (endHour === startHour && endMin <= startMin)) {
        const endDate = new Date(year, month - 1, day + 1);
        const endDateStr = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}`;
        endStr = `${endDateStr}T${pad(endHour)}${pad(endMin)}00`;
      }

      lines.push(`DTSTART;TZID=Asia/Tokyo:${startStr}`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${endStr}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

export interface ShiftsToIcalEventsParams {
  shifts: Shift[];
  /** Map type key to display label */
  labelOf: (typeKey: string) => string;
  /** Check if type key is "unavailable" */
  isUnavailable: (typeKey: string) => boolean;
  includeUnavailable: boolean;
}

export type ExportShiftStatus = Shift["status"];

export interface FilterShiftsForExportParams {
  shifts: Shift[];
  memberId: string;
  startDate: string;
  endDate: string;
  typeKeys: ReadonlySet<string>;
  statuses: ReadonlySet<ExportShiftStatus>;
}

/** カレンダー出力の対象を、本人・期間・種別・状態で絞り込む。日付は YYYY-MM-DD。 */
export function filterShiftsForExport({
  shifts,
  memberId,
  startDate,
  endDate,
  typeKeys,
  statuses,
}: FilterShiftsForExportParams): Shift[] {
  return shifts.filter(
    (shift) =>
      shift.memberId === memberId &&
      shift.date >= startDate &&
      shift.date <= endDate &&
      typeKeys.has(shift.type) &&
      statuses.has(shift.status),
  );
}

export interface ShiftsToSpreadsheetRowParams {
  shifts: Shift[];
  year: number;
  /** 1..12 */
  month: number;
  labelOf: (typeKey: string) => string;
}

function spreadsheetTime(time: string): string {
  return time.replace(/^0(?=\d:)/, "");
}

/** 「8月シフト」の日付セルに合わせた表示へ変換する。 */
export function formatSpreadsheetShift(
  shift: Shift,
  labelOf: (typeKey: string) => string,
): string {
  const label = labelOf(shift.type);
  if (!shift.startTime || !shift.endTime) return label;

  const timeRange = `${spreadsheetTime(shift.startTime)}-${spreadsheetTime(shift.endTime)}`;
  if (label === "出勤") return timeRange;
  if (label === "リモート") return `${timeRange}(リ)`;
  return `${timeRange}(${label})`;
}

/** 月次シフト表の「1日」から貼れる、日数ぶんの1行を作る。 */
export function shiftsToSpreadsheetRow({
  shifts,
  year,
  month,
  labelOf,
}: ShiftsToSpreadsheetRowParams): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
    return shifts
      .filter((shift) => shift.date === date)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
      .map((shift) => formatSpreadsheetShift(shift, labelOf))
      .join(",");
  });
}

/** Convert shifts to iCal events */
export function shiftsToIcalEvents({
  shifts,
  labelOf,
  isUnavailable,
  includeUnavailable,
}: ShiftsToIcalEventsParams): IcalEvent[] {
  return shifts
    .filter((shift) => {
      if (!includeUnavailable && isUnavailable(shift.type)) {
        return false;
      }
      return true;
    })
    .map((shift) => ({
      uid: `${shift.id}@copia-shift`,
      summary: `Copia ${labelOf(shift.type)}`,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
    }));
}
