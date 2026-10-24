import { describe, expect, it } from "vitest";
import { googleSurveyUrl, studyRoomJoinUrl, parseStudyRoomBoard, studyRoomDay, type StudyRoomState } from "../src/studyRooms";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyRoomRow } from "../src/components/StudyRoomRow";
import { attachSurveyRows, calendarDate, parseCalendarTab, syncStudyRooms } from "../worker/src/studyRoomSync";

const spreadsheetId = "calendar-sheet-id-0123456789";
const sourceUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
const formUrl = "https://docs.google.com/forms/d/form-id/edit";
const resultsUrl = "https://docs.google.com/spreadsheets/d/results-id/edit";
const now = new Date("2026-10-24T08:00:00Z");
const session = { id: "2026-10-23_19:00", date: "2026-10-23", startTime: "19:00", sourceUrl };
const headers = ["日付", "曜日", "開始", "自習室", "セミナー担当者", "カレンダー用タイトル"];
function tab(rows: string[][]) {
  return { properties: { title: "10月セミナーカレンダー", sheetId: 123 },
    data: [{ rowData: [headers, ...rows].map((r) => ({ values: r.map((v) => ({ formattedValue: v })) })) }] };
}
function state(sessions = [session]): StudyRoomState {
  return { kind: "ready", board: { syncedAt: now.getTime(), coveredMonths: ["2026-10"], sessions } };
}

describe("calendar projection", () => {
  it("reads the actual participation URL from the calendar hyperlink, including labelled links", () => {
    const calendar = tab([["2026/10/23", "金", "19:00:00", "田村", "", "自習室"]]);
    calendar.data[0].rowData[0].values.push({ formattedValue: "テーマ・タイトル" }, { formattedValue: "自習室用zoomリンク" });
    calendar.data[0].rowData[1].values.push({ formattedValue: "AIツールの相談" }, { formattedValue: "Zoomで参加", hyperlink: "https://us06web.zoom.us/j/12345678900" } as { formattedValue: string });
    expect(parseCalendarTab(calendar, spreadsheetId).sessions[0]).toMatchObject({ title: "自習室", content: "AIツールの相談", joinUrl: "https://us06web.zoom.us/j/12345678900" });
    expect(studyRoomJoinUrl("https://zoom.us.evil.test/j/123")).toBeUndefined();
    expect(studyRoomJoinUrl("https://zoom.us/" )).toBeUndefined();
  });
  it("validates dates rather than rolling invalid dates into another month", () => {
    expect(calendarDate("2026/2/29")).toBeNull();
    expect(calendarDate("2028年2月29日")).toBe("2028-02-29");
  });
  it("uses actual calendar rows, excludes seminars and cancellations, keeps multiple sessions", () => {
    const parsed = parseCalendarTab(tab([
      ["2026/10/23", "金", "19:00:00", "田村", "", "自習室"],
      ["2026/10/23", "金", "13:00:00", "佐藤", "", "自習室"],
      ["2026/10/23", "金", "20:00:00", "", "講師", "AIセミナー"],
      ["2026/10/24", "土", "13:00:00", "田村", "", "自習室 中止"],
      ["2026/10/25", "日", "", "田村", "", "自習室"],
    ]), spreadsheetId);
    expect(parsed.sessions.map((s) => s.startTime)).toEqual(["19:00", "13:00"]);
    expect(parsed.coveredMonths).toEqual([]); // a partial calendar must not mean no session
    expect(parsed.uncertainDates).toEqual(["2026-10-25"]);
    expect(parsed.sessions[0].sourceUrl).toContain("range=A2");
  });
  it("only declares an entire month covered when every date is represented", () => {
    const rows = Array.from({ length: 31 }, (_, i) => [`2026/10/${i + 1}`, "", "", "", "", ""]);
    expect(parseCalendarTab(tab(rows), spreadsheetId).coveredMonths).toEqual(["2026-10"]);
  });
  it("fails on changed source structure", () => {
    expect(() => parseCalendarTab({ properties: { title: "10月", sheetId: 1 }, data: [] }, spreadsheetId)).toThrow();
  });
});

it("links the scheduled circle directly to the session, rather than to the calendar", () => {
  const date = "2099-10-23";
  const joinUrl = "https://us06web.zoom.us/j/12345678900";
  const html = renderToStaticMarkup(createElement(StudyRoomRow, { dates: [date], nameWidth: 100, columnWidth: 48,
    state: { kind: "ready", board: { syncedAt: Date.now(), coveredMonths: ["2099-10"], sessions: [{ ...session, date, joinUrl }] } },
  }));
  expect(html).toContain(`href="${joinUrl}"`);
  expect(html).not.toContain(`href="${sourceUrl}"`);
});

it("rereads calendar content and participation URLs on every sync and removes deleted links", async () => {
  const snapshots: Record<string, unknown>[] = [];
  let generation = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    expect(init?.cache).toBe("no-store");
    if (String(input).includes("gridProperties(rowCount)")) return new Response(JSON.stringify({ sheets: [{ properties: { title: "10月セミナーカレンダー", sheetId: 123 } }] }));
    const calendar = tab([["2026/10/23", "金", "19:00:00", "田村", "", "自習室"]]);
    calendar.data[0].rowData[0].values.push({ formattedValue: "テーマ・タイトル" }, { formattedValue: "自習室用zoomリンク" });
    calendar.data[0].rowData[1].values.push({ formattedValue: generation ? "更新された相談内容" : "以前の相談内容" }, { formattedValue: generation ? "" : "https://us06web.zoom.us/j/12345678900" });
    return new Response(JSON.stringify({ sheets: [calendar] }));
  };
  const params = { groupId: "group-1", spreadsheetId, accessToken: "test", fetchImpl, firestore: { setDocument: async (_path: string, fields: Record<string, unknown>) => { snapshots.push(fields); } } };
  await syncStudyRooms(params);
  generation++;
  await syncStudyRooms(params);
  expect(parseStudyRoomBoard(snapshots[0])?.sessions[0]).toMatchObject({ content: "以前の相談内容", joinUrl: "https://us06web.zoom.us/j/12345678900" });
  const latest = parseStudyRoomBoard(snapshots[1])?.sessions[0];
  expect(latest?.content).toBe("更新された相談内容");
  expect(latest?.joinUrl).toBeUndefined();
});

describe("survey matching", () => {
  const indexHeader = ["開催日", "開始", "Googleフォーム", "集計スプレッドシート", "Slack出典"];
  const evidence = "https://example.slack.com/archives/C12345/p1792742307681749";
  it("attaches verified links to the exact session without changing the original", () => {
    const linked = attachSurveyRows([session], [indexHeader, ["2026/10/23", "19:00", formUrl, resultsUrl, evidence]]);
    expect(linked[0]).toMatchObject({ formUrl, resultsUrl });
    expect(session).not.toHaveProperty("formUrl");
  });
  it("does not guess a session when two sessions occur on the same day", () => {
    const linked = attachSurveyRows([session, { ...session, id: "second", startTime: "13:00" }], [indexHeader, ["2026/10/23", "", formUrl, resultsUrl, evidence]]);
    expect(linked.every((s) => !s.formUrl)).toBe(true);
  });
  it("rejects links without Slack evidence, untrusted domains, or conflicting results", () => {
    expect(attachSurveyRows([session], [indexHeader, ["2026/10/23", "", formUrl, resultsUrl, ""]])[0].formUrl).toBeUndefined();
    expect(googleSurveyUrl("https://docs.google.com.evil.test/forms/d/a", "form")).toBeUndefined();
    expect(googleSurveyUrl("javascript:alert(1)", "form")).toBeUndefined();
    expect(() => attachSurveyRows([session], [indexHeader,
      ["2026/10/23", "", formUrl, resultsUrl, evidence],
      ["2026/10/23", "", "https://forms.gle/other", "", evidence],
    ])).toThrow("conflicting");
  });
});

describe("list row states", () => {
  it("keeps unavailable, out-of-coverage and stale states distinct from no session", () => {
    expect(studyRoomDay({ kind: "unavailable" }, session.date, now.getTime()).kind).toBe("unknown");
    expect(studyRoomDay(state(), "2026-11-01", now.getTime()).kind).toBe("unknown");
    expect(studyRoomDay(state(), "2026-10-22", now.getTime()).kind).toBe("none");
    expect(studyRoomDay(state(), session.date, now.getTime() + 3_600_001).kind).toBe("unknown");
  });
  it("does not turn a form created before the session into a completed-session marker", () => {
    const linked = state([{ ...session, ...{ formUrl } }]);
    expect(studyRoomDay(linked, session.date, now.getTime()).kind).toBe("survey");
    const sameDay = new Date("2026-10-23T12:00:00Z").getTime();
    if (linked.kind === "ready") linked.board.syncedAt = sameDay;
    expect(studyRoomDay(linked, session.date, sameDay).kind).toBe("scheduled");
    if (linked.kind === "ready") linked.board.sessions[0].held = true;
    expect(studyRoomDay(linked, session.date, sameDay).kind).toBe("survey");
  });
  it("fails closed for malformed cached documents", () => {
    expect(parseStudyRoomBoard({ syncedAt: now.getTime(), payload: "not-json" })).toBeNull();
  });
});

it("writes only the calendar projection and verified index links after all reads succeed", async () => {
  const writes: unknown[] = [];
  const calendar = tab([["2026/10/23", "金", "19:00:00", "田村", "", "自習室"]]);
  let call = 0;
  const replies = [
    { sheets: [{ properties: { title: calendar.properties.title, sheetId: 123, gridProperties: { rowCount: 100 } } }] },
    { sheets: [calendar] },
    { values: [["開催日", "開始", "Googleフォーム", "集計スプレッドシート", "Slack出典", "実施確認"],
      ["2026-10-23", "19:00", formUrl, resultsUrl, "https://example.slack.com/archives/C123/p1792742307681749", "実施済み"]] },
  ];
  const result = await syncStudyRooms({ groupId: "group-1", spreadsheetId, surveySpreadsheetId: "survey-index-01234567890", accessToken: "test", now,
    firestore: { setDocument: async (path, fields) => { writes.push({ path, fields }); } },
    fetchImpl: async () => new Response(JSON.stringify(replies[call++]), { headers: { "Content-Type": "application/json" } }),
  });
  expect(result).toEqual({ sessionCount: 1, surveyCount: 1 });
  expect(writes).toHaveLength(1);
  const doc = writes[0] as { path: string; fields: Record<string, unknown> };
  expect(doc.path).toBe("groups/group-1/taskBoard/studyRooms");
  expect(parseStudyRoomBoard(doc.fields)?.sessions[0]).toMatchObject({ formUrl, resultsUrl, held: true });
  expect(doc.fields.payload).not.toContain("田村");
});

it("leaves the previous projection untouched when upstream returns 403", async () => {
  let writes = 0;
  await expect(syncStudyRooms({ firestore: { setDocument: async () => { writes++; } }, groupId: "group-1", spreadsheetId,
    accessToken: "test", fetchImpl: async () => new Response("", { status: 403 }),
  })).rejects.toThrow("403");
  expect(writes).toBe(0);
});
