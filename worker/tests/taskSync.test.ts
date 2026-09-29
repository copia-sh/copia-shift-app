import { describe, it, expect, vi } from "vitest";
import { syncTaskBoard } from "../src/taskSync";
import { parseTaskBoardDoc } from "../../src/taskBoard";

const SPREADSHEET_ID = "1TestSpreadsheetIdForUnitTests_00";

const taskRows = [
  ["フェーズ", "No", "担当インターン生", "タスク内容", "ステータス"],
  ["フェーズ1", "1", "佐藤", "講座を整理する", "進行中"],
  ["フェーズ1", "2", "", "レコメンドを作る", "未着手"],
];
const routineRows = [
  ["頻度", "タスク内容", "担当インターン生", "ステータス"],
  ["毎週", "報告会の準備", "田村・佐藤・曽根（共同）", "運用中"],
];

function sheetsFetch(valueRanges: unknown[] = [{ values: taskRows }, { values: routineRows }], status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ valueRanges }), { status }));
}

function fakeFirestore() {
  return { setDocument: vi.fn(async () => {}) };
}

describe("syncTaskBoard", () => {
  const now = new Date("2026-09-29T03:00:00Z");

  it("reads both tabs in one batchGet and stores a parsed board", async () => {
    const fetchImpl = sheetsFetch();
    const firestore = fakeFirestore();
    const result = await syncTaskBoard({ firestore, groupId: "g1", spreadsheetId: SPREADSHEET_ID, accessToken: "t", now, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/spreadsheets/${SPREADSHEET_ID}/values:batchGet?`);
    expect(decodeURIComponent(url)).toContain("ranges='タスク一覧'!A:Z");
    expect(decodeURIComponent(url)).toContain("ranges='定例業務（毎週・毎日など）'!A:Z");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");

    const [path, fields] = firestore.setDocument.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(path).toBe("groups/g1/taskBoard/current");
    const board = parseTaskBoardDoc(fields);
    expect(board?.syncedAt).toBe(now.getTime());
    expect(board?.sourceUrl).toBe(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
    expect(board?.tasks.map((t) => t.title)).toEqual(["講座を整理する", "レコメンドを作る"]);
    expect(board?.routines[0].assignees).toEqual(["田村", "佐藤", "曽根"]);
    expect(result).toEqual({ taskCount: 2, routineCount: 1 });
  });

  it("does not write when a tab lost its required columns", async () => {
    const firestore = fakeFirestore();
    const fetchImpl = sheetsFetch([{ values: [["No"]] }, { values: routineRows }]);
    await expect(
      syncTaskBoard({ firestore, groupId: "g1", spreadsheetId: SPREADSHEET_ID, accessToken: "t", now, fetchImpl }),
    ).rejects.toThrow(/タスク内容/);
    expect(firestore.setDocument).not.toHaveBeenCalled();
  });

  it("fails on a Sheets API error without writing", async () => {
    const firestore = fakeFirestore();
    await expect(
      syncTaskBoard({ firestore, groupId: "g1", spreadsheetId: SPREADSHEET_ID, accessToken: "t", now, fetchImpl: sheetsFetch([], 403) }),
    ).rejects.toThrow(/403/);
    expect(firestore.setDocument).not.toHaveBeenCalled();
  });

  it("rejects unsafe ids before any request", async () => {
    const firestore = fakeFirestore();
    const fetchImpl = sheetsFetch();
    await expect(
      syncTaskBoard({ firestore, groupId: "g1/../x", spreadsheetId: SPREADSHEET_ID, accessToken: "t", now, fetchImpl }),
    ).rejects.toThrow();
    await expect(
      syncTaskBoard({ firestore, groupId: "g1", spreadsheetId: "bad id", accessToken: "t", now, fetchImpl }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
