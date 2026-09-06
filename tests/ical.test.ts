import { describe, it, expect } from "vitest";
import {
  escapeIcalText,
  foldIcalLine,
  buildIcalendar,
  filterShiftsForExport,
  formatSpreadsheetShift,
  shiftsToSpreadsheetRow,
  shiftsToIcalEvents,
  type IcalEvent,
} from "../src/utils/ical";
import type { Shift } from "../src/types";

describe("escapeIcalText", () => {
  it("escapes backslash", () => {
    expect(escapeIcalText("a\\b")).toBe("a\\\\b");
  });

  it("escapes semicolon", () => {
    expect(escapeIcalText("a;b")).toBe("a\\;b");
  });

  it("escapes comma", () => {
    expect(escapeIcalText("a,b")).toBe("a\\,b");
  });

  it("escapes newline", () => {
    expect(escapeIcalText("a\nb")).toBe("a\\nb");
  });

  it("escapes multiple special characters", () => {
    expect(escapeIcalText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });

  it("escapes backslash before other characters", () => {
    expect(escapeIcalText("\\;")).toBe("\\\\\\;");
  });
});

describe("foldIcalLine", () => {
  it("does not fold short lines", () => {
    const line = "SUMMARY:Test Event";
    expect(foldIcalLine(line)).toBe(line);
  });

  it("folds long ASCII lines at 75 octets", () => {
    const line = "SUMMARY:" + "a".repeat(100);
    const result = foldIcalLine(line);
    const lines = result.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l, i) => {
      if (i === 0) {
        expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
      } else {
        expect(l.startsWith(" ")).toBe(true);
        expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
      }
    });
  });

  it("handles multibyte characters correctly", () => {
    const line = "SUMMARY:出勤希望" + "a".repeat(80);
    const result = foldIcalLine(line);
    const lines = result.split("\r\n");
    // First line should start with SUMMARY
    expect(lines[0].startsWith("SUMMARY")).toBe(true);
    // If folded, continuation lines should start with space
    if (lines.length > 1) {
      lines.slice(1).forEach((l) => {
        expect(l.startsWith(" ")).toBe(true);
      });
    }
    // All lines should be within octets limit
    lines.forEach((l) => {
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    });
  });
});

describe("buildIcalendar", () => {
  it("creates valid vcalendar structure", () => {
    const events: IcalEvent[] = [];
    const ics = buildIcalendar(events);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Copia//Shift//JA");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses provided calendar name in X-WR-CALNAME", () => {
    const ics = buildIcalendar([], { calendarName: "My Calendar" });
    expect(ics).toContain("X-WR-CALNAME:My Calendar");
  });

  it("uses CRLF line endings", () => {
    const ics = buildIcalendar([], { calendarName: "Test" });
    const lines = ics.split("\r\n");
    // Should have multiple lines
    expect(lines.length).toBeGreaterThan(1);
    // Should end with CRLF
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("generates DTSTAMP in UTC with correct format", () => {
    const testDate = new Date(2026, 7, 25, 14, 30, 45); // Aug 25, 2026 14:30:45 local
    const events: IcalEvent[] = [
      {
        uid: "test1@copia-shift",
        summary: "Test Event",
        date: "2026-08-25",
        startTime: "09:00",
        endTime: "17:00",
      },
    ];
    const ics = buildIcalendar(events, { now: testDate });
    // DTSTAMP should be in format YYYYMMDDTHHMMSSZ
    const dtstampMatch = ics.match(/DTSTAMP:(\d{8}T\d{6}Z)/);
    expect(dtstampMatch).not.toBeNull();
    expect(dtstampMatch![1]).toMatch(/\d{8}T\d{6}Z/);
  });

  it("creates all-day event with DTSTART VALUE=DATE and next day DTEND", () => {
    const events: IcalEvent[] = [
      {
        uid: "test1@copia-shift",
        summary: "All day event",
        date: "2026-08-25",
        startTime: null,
        endTime: null,
      },
    ];
    const ics = buildIcalendar(events);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260825");
    expect(ics).toContain("DTEND;VALUE=DATE:20260826");
  });

  it("creates timed event with TZID=Asia/Tokyo", () => {
    const events: IcalEvent[] = [
      {
        uid: "test1@copia-shift",
        summary: "Timed event",
        date: "2026-08-25",
        startTime: "09:00",
        endTime: "17:00",
      },
    ];
    const ics = buildIcalendar(events);
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20260825T090000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20260825T170000");
  });

  it("handles end time before start time by moving to next day", () => {
    const events: IcalEvent[] = [
      {
        uid: "test1@copia-shift",
        summary: "Night shift",
        date: "2026-08-25",
        startTime: "22:00",
        endTime: "02:00",
      },
    ];
    const ics = buildIcalendar(events);
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20260825T220000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20260826T020000");
  });

  it("includes UID, SUMMARY, and DTSTAMP in each event", () => {
    const events: IcalEvent[] = [
      {
        uid: "test1@copia-shift",
        summary: "Test Event",
        date: "2026-08-25",
        startTime: "09:00",
        endTime: "17:00",
      },
    ];
    const ics = buildIcalendar(events);
    expect(ics).toContain("UID:test1@copia-shift");
    expect(ics).toContain("SUMMARY:Test Event");
    expect(ics).toContain("DTSTAMP:");
  });

  it("escapes and folds SUMMARY line", () => {
    const events: IcalEvent[] = [
      {
        uid: "test1@copia-shift",
        summary: "Event;with,special\\characters\nand newline",
        date: "2026-08-25",
        startTime: "09:00",
        endTime: "17:00",
      },
    ];
    const ics = buildIcalendar(events);
    // Should escape the special characters
    expect(ics).toContain("SUMMARY:Event\\;with\\,special\\\\characters\\nand newline");
  });
});

describe("shiftsToIcalEvents", () => {
  it("converts shifts to ical events", () => {
    const shifts: Shift[] = [
      {
        id: "shift1",
        memberId: "user1",
        date: "2026-08-25",
        status: "desired",
        type: "出勤",
        startTime: null,
        endTime: null,
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
    ];

    const events = shiftsToIcalEvents({
      shifts,
      labelOf: (key) => (key === "出勤" ? "出勤" : key),
      isUnavailable: () => false,
      includeUnavailable: true,
    });

    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("shift1@copia-shift");
    expect(events[0].summary).toBe("Copia 出勤");
    expect(events[0].date).toBe("2026-08-25");
    expect(events[0].startTime).toBeNull();
    expect(events[0].endTime).toBeNull();
  });

  it("excludes unavailable shifts when includeUnavailable is false", () => {
    const shifts: Shift[] = [
      {
        id: "shift1",
        memberId: "user1",
        date: "2026-08-25",
        status: "desired",
        type: "出勤",
        startTime: null,
        endTime: null,
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
      {
        id: "shift2",
        memberId: "user1",
        date: "2026-08-26",
        status: "desired",
        type: "欠勤",
        startTime: null,
        endTime: null,
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
    ];

    const events = shiftsToIcalEvents({
      shifts,
      labelOf: (key) => key,
      isUnavailable: (key) => key === "欠勤",
      includeUnavailable: false,
    });

    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("shift1@copia-shift");
  });

  it("includes unavailable shifts when includeUnavailable is true", () => {
    const shifts: Shift[] = [
      {
        id: "shift1",
        memberId: "user1",
        date: "2026-08-25",
        status: "desired",
        type: "出勤",
        startTime: null,
        endTime: null,
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
      {
        id: "shift2",
        memberId: "user1",
        date: "2026-08-26",
        status: "desired",
        type: "欠勤",
        startTime: null,
        endTime: null,
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
    ];

    const events = shiftsToIcalEvents({
      shifts,
      labelOf: (key) => key,
      isUnavailable: (key) => key === "欠勤",
      includeUnavailable: true,
    });

    expect(events).toHaveLength(2);
  });

  it("uses labelOf to determine summary", () => {
    const shifts: Shift[] = [
      {
        id: "shift1",
        memberId: "user1",
        date: "2026-08-25",
        status: "desired",
        type: "type1",
        startTime: null,
        endTime: null,
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
    ];

    const events = shiftsToIcalEvents({
      shifts,
      labelOf: (key) => (key === "type1" ? "Custom Label" : key),
      isUnavailable: () => false,
      includeUnavailable: true,
    });

    expect(events[0].summary).toBe("Copia Custom Label");
  });

  it("preserves timed event details", () => {
    const shifts: Shift[] = [
      {
        id: "shift1",
        memberId: "user1",
        date: "2026-08-25",
        status: "desired",
        type: "出勤",
        startTime: "09:00",
        endTime: "17:00",
        createdBy: "user1",
        createdAt: 1234567890,
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: 1234567890,
      },
    ];

    const events = shiftsToIcalEvents({
      shifts,
      labelOf: () => "出勤",
      isUnavailable: () => false,
      includeUnavailable: true,
    });

    expect(events[0].startTime).toBe("09:00");
    expect(events[0].endTime).toBe("17:00");
  });
});

describe("filterShiftsForExport", () => {
  const makeShift = (overrides: Partial<Shift>): Shift => ({
    id: "shift1",
    memberId: "user1",
    date: "2026-09-10",
    status: "desired",
    type: "出勤",
    startTime: null,
    endTime: null,
    createdBy: "user1",
    createdAt: 1,
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: 1,
    ...overrides,
  });

  it("filters by member, inclusive date range, type, and status", () => {
    const shifts = [
      makeShift({ id: "start", date: "2026-09-01" }),
      makeShift({ id: "end", date: "2026-09-30", status: "confirmed" }),
      makeShift({ id: "other-member", memberId: "user2" }),
      makeShift({ id: "outside", date: "2026-10-01" }),
      makeShift({ id: "wrong-type", type: "欠勤" }),
    ];

    const result = filterShiftsForExport({
      shifts,
      memberId: "user1",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      typeKeys: new Set(["出勤"]),
      statuses: new Set(["desired", "confirmed"]),
    });

    expect(result.map((shift) => shift.id)).toEqual(["start", "end"]);
  });

  it("can export confirmed shifts only", () => {
    const result = filterShiftsForExport({
      shifts: [makeShift({ id: "wanted" }), makeShift({ id: "fixed", status: "confirmed" })],
      memberId: "user1",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      typeKeys: new Set(["出勤"]),
      statuses: new Set(["confirmed"]),
    });

    expect(result.map((shift) => shift.id)).toEqual(["fixed"]);
  });
});

describe("spreadsheet export", () => {
  const makeShift = (overrides: Partial<Shift>): Shift => ({
    id: "shift1",
    memberId: "user1",
    date: "2026-08-01",
    status: "desired",
    type: "出勤",
    startTime: "09:00",
    endTime: "17:00",
    createdBy: "user1",
    createdAt: 1,
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: 1,
    ...overrides,
  });

  it("matches the monthly sheet notation", () => {
    expect(formatSpreadsheetShift(makeShift({}), (key) => key)).toBe("9:00-17:00");
    expect(formatSpreadsheetShift(makeShift({ type: "リモート" }), (key) => key)).toBe("9:00-17:00(リ)");
    expect(
      formatSpreadsheetShift(
        makeShift({ type: "欠勤", startTime: null, endTime: null }),
        (key) => key,
      ),
    ).toBe("欠勤");
  });

  it("creates one tab-ready cell per day and joins multiple shifts", () => {
    const row = shiftsToSpreadsheetRow({
      shifts: [
        makeShift({ id: "afternoon", date: "2026-08-02", startTime: "13:00", endTime: "18:00" }),
        makeShift({ id: "morning", date: "2026-08-02", type: "リモート", startTime: "09:00", endTime: "12:00" }),
        makeShift({ id: "last", date: "2026-08-31", startTime: "10:00", endTime: "19:00" }),
      ],
      year: 2026,
      month: 8,
      labelOf: (key) => key,
    });

    expect(row).toHaveLength(31);
    expect(row[0]).toBe("");
    expect(row[1]).toBe("9:00-12:00(リ),13:00-18:00");
    expect(row[30]).toBe("10:00-19:00");
  });
});
