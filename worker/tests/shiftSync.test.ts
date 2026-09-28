import { describe, expect, it, vi } from "vitest";
import { buildShiftSyncPayloads } from "../src/agentShifts";
import type { FirestoreClient, FirestoreDocument } from "../src/firestoreRest";
import { syncShiftSheet } from "../src/shiftSync";

function fakeFirestore(docs: Record<string, Record<string, unknown>>): FirestoreClient {
  return {
    async getDocument(path: string): Promise<FirestoreDocument | null> {
      const data = docs[path];
      return data ? { id: path.split("/").pop() as string, data } : null;
    },
    async queryCollection(parentPath, collectionId, filters): Promise<FirestoreDocument[]> {
      const prefix = `${parentPath}/${collectionId}/`;
      return Object.entries(docs)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, data]) => ({ id: path.slice(prefix.length), data }))
        .filter((doc) =>
          filters.every((filter) => {
            const value = doc.data[filter.field];
            if (filter.op === "==") return value === filter.value;
            if (filter.op === ">=") return (value as string) >= filter.value;
            return (value as string) <= filter.value;
          }),
        );
    },
  };
}

const firestore = fakeFirestore({
  "groups/g1/members/u1": { displayName: "田村 駿貴", active: true, email: "private@example.com" },
  "groups/g1/members/u2": { displayName: "曽根", active: true },
  "groups/g1/members/u3": { displayName: "退会者", active: false },
  "groups/g1/members/u4": { displayName: "社員", active: true, shiftTarget: false },
  "groups/g1/shifts/s1": {
    memberId: "u1",
    date: "2026-09-09",
    type: "出勤",
    startTime: "10:00",
    endTime: "18:00",
  },
  "groups/g1/shifts/s2": {
    memberId: "u3",
    date: "2026-09-09",
    type: "出勤",
    startTime: "09:00",
    endTime: "17:00",
  },
  // 同じ日の2枠目。月間表では1セルにカンマ区切りで入る
  "groups/g1/shifts/s3": {
    memberId: "u1",
    date: "2026-09-10",
    type: "出勤",
    startTime: "09:00",
    endTime: "13:00",
  },
  "groups/g1/shifts/s4": {
    memberId: "u1",
    date: "2026-09-10",
    type: "リモート",
    startTime: "14:00",
    endTime: "18:00",
  },
  // 却下された枠。月間表には出さない
  "groups/g1/shifts/s5": {
    memberId: "u2",
    date: "2026-09-11",
    type: "却下",
    startTime: "09:00",
    endTime: "18:00",
  },
  // シフト表対象外のメンバーの枠。どちらのタブにも出さない
  "groups/g1/shifts/s6": {
    memberId: "u4",
    date: "2026-09-09",
    type: "出勤",
    startTime: "08:00",
    endTime: "12:00",
  },
});

describe("buildShiftSyncPayloads", () => {
  it("シフト表対象外のメンバーは同期に出さない", async () => {
    const result = await buildShiftSyncPayloads({ firestore, groupId: "g1", dates: ["2026-09-09"] });
    expect(result.map((row) => row.name)).toEqual(["田村 駿貴", "曽根"]);
  });

  it("includes active members and exact dates only, without an email or member id", async () => {
    const result = await buildShiftSyncPayloads({
      firestore,
      groupId: "g1",
      dates: ["2026-09-10", "2026-09-09"],
    });

    expect(result.map(({ date, name, workStart, workEnd, labels }) => ({ date, name, workStart, workEnd, labels }))).toEqual([
      { date: "2026-09-09", name: "田村 駿貴", workStart: "10:00", workEnd: "18:00", labels: ["出勤"] },
      { date: "2026-09-09", name: "曽根", workStart: null, workEnd: null, labels: [] },
      { date: "2026-09-10", name: "田村 駿貴", workStart: "09:00", workEnd: "18:00", labels: ["出勤", "リモート"] },
      { date: "2026-09-10", name: "曽根", workStart: null, workEnd: null, labels: [] },
    ]);
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("u1");
  });
});

/** Sheets API のレスポンスを順番に積むヘルパー。 */
function sheetsFetch(...responses: Response[]) {
  const impl = vi.fn<typeof fetch>();
  for (const response of responses) impl.mockResolvedValueOnce(response);
  return impl;
}

function tabList(...titles: string[]): Response {
  const sheets = titles.map((title) => ({ properties: { title } }));
  return new Response(JSON.stringify({ sheets }), { status: 200 });
}

const ok = () => new Response("{}", { status: 200 });

const SHEET_ID = "1TestSpreadsheetIdForUnitTests_00";
const NOW = new Date("2026-09-09T00:00:00.000Z");

function run(fetchImpl: ReturnType<typeof sheetsFetch>, includeMatrix = false) {
  return syncShiftSheet({
    firestore,
    groupId: "g1",
    spreadsheetId: SHEET_ID,
    accessToken: "token",
    now: NOW,
    fetchImpl,
    includeMatrix,
  });
}

/** 月間表も書く実行（30分ごとのCron相当） */
const runWithMatrix = (fetchImpl: ReturnType<typeof sheetsFetch>) => run(fetchImpl, true);

describe("syncShiftSheet", () => {
  it("clears the whole data range, then writes a JST timestamped table", async () => {
    const fetchImpl = sheetsFetch(tabList("シフト同期"), ok(), ok());

    await expect(run(fetchImpl)).resolves.toEqual({ rowCount: 16, matrixRowCount: 0 });

    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    // 行数が減ったときに古い行が残らないよう、行数を決め打ちせず列全体を消す。
    expect(urls[1]).toContain(encodeURIComponent("'シフト同期'!A:G"));
    expect(urls[1]).toContain(":clear");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "POST" });

    const [writeUrl, writeInit] = fetchImpl.mock.calls[2];
    expect(String(writeUrl)).toContain(encodeURIComponent("'シフト同期'!A1"));
    expect(writeInit).toMatchObject({ method: "PUT" });
    const rows = JSON.parse(writeInit?.body as string).values;
    expect(rows[0]).toEqual(["更新日時", "日付", "氏名", "勤務開始", "勤務終了", "勤務区分", "同期状態"]);
    expect(rows[1]).toEqual(["2026-09-09 09:00:00 JST", "2026-09-09", "田村 駿貴", "10:00", "18:00", "出勤", "同期済み"]);
  });

  it("creates the シフト同期 tab when the spreadsheet does not have one yet", async () => {
    // 初回有効化時にタブが無いと、書き込みが400で落ちる。無ければ作ってから進む。
    const fetchImpl = sheetsFetch(tabList("更新履歴"), ok(), ok(), ok(), ok(), ok());

    await expect(runWithMatrix(fetchImpl)).resolves.toEqual({ rowCount: 16, matrixRowCount: 2 });

    const [addUrl, addInit] = fetchImpl.mock.calls[1];
    expect(String(addUrl)).toContain(":batchUpdate");
    const body = JSON.parse(addInit?.body as string);
    expect(body.requests.map((request: { addSheet: { properties: { title: string } } }) => request.addSheet.properties.title)).toEqual([
      "シフト同期",
      "シフト月間表",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("月間表タブだけが無ければ、それだけを作る", async () => {
    // 一覧の読み取り → タブ追加 → 一覧のclear/write → 月間表のclear/write
    const fetchImpl = sheetsFetch(tabList("シフト同期"), ok(), ok(), ok(), ok(), ok());

    await runWithMatrix(fetchImpl);

    const body = JSON.parse(fetchImpl.mock.calls[1][1]?.body as string);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].addSheet.properties.title).toBe("シフト月間表");
  });

  it("does not create the tab when it already exists", async () => {
    const fetchImpl = sheetsFetch(tabList("更新履歴", "シフト同期", "シフト月間表"), ok(), ok(), ok(), ok());

    await runWithMatrix(fetchImpl);

    expect(fetchImpl.mock.calls.map(([url]) => String(url)).some((url) => url.includes(":batchUpdate"))).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("月間表を書かない実行では、月間表タブに触れない", async () => {
    const fetchImpl = sheetsFetch(tabList("シフト同期", "シフト月間表"), ok(), ok());

    await expect(run(fetchImpl)).resolves.toEqual({ rowCount: 16, matrixRowCount: 0 });

    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes(encodeURIComponent("シフト月間表")))).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("メンバー×日付の月間表を、30日分の別タブへ書く", async () => {
    const fetchImpl = sheetsFetch(tabList("シフト同期", "シフト月間表"), ok(), ok(), ok(), ok());

    await runWithMatrix(fetchImpl);

    const [clearUrl] = fetchImpl.mock.calls[3];
    expect(String(clearUrl)).toContain(encodeURIComponent("'シフト月間表'!A:AE"));

    const [writeUrl, writeInit] = fetchImpl.mock.calls[4];
    expect(String(writeUrl)).toContain(encodeURIComponent("'シフト月間表'!A1"));
    const rows = JSON.parse(writeInit?.body as string).values;

    expect(rows[0][0]).toBe("更新日時");
    expect(rows[0][1]).toBe("2026-09-09 09:00:00 JST");
    // 2行目は日付。30日分ぶん並ぶ
    expect(rows[1][0]).toBe("氏名");
    expect(rows[1]).toHaveLength(31);
    expect(rows[1][1]).toBe("9/9(水)");
    expect(rows[1][30]).toBe("10/8(木)");

    // 3行目以降が1人1行。シフト表対象外・退会者は出ない
    expect(rows.slice(2).map((row: string[]) => row[0])).toEqual(["田村 駿貴", "曽根"]);
    expect(rows[2][1]).toBe("10:00-18:00");
    // 同じ日の複数枠はカンマ区切り。リモートは (リ) を付ける
    expect(rows[2][2]).toBe("9:00-13:00,14:00-18:00(リ)");
    // 却下された枠はセルに出さない（全置換なので次の同期で消える）
    expect(rows[3][3]).toBe("");
  });

  it("fails loudly when the spreadsheet cannot be read", async () => {
    const fetchImpl = sheetsFetch(new Response(null, { status: 403 }));

    await expect(run(fetchImpl)).rejects.toThrow(/403/);
  });

  it("fails loudly when the write is rejected", async () => {
    const fetchImpl = sheetsFetch(tabList("シフト同期"), ok(), new Response(null, { status: 500 }));

    await expect(run(fetchImpl)).rejects.toThrow(/500/);
  });

  it("rejects a spreadsheet id that is not a plausible Google file id, before any request", async () => {
    const fetchImpl = sheetsFetch();

    await expect(
      syncShiftSheet({
        firestore,
        groupId: "g1",
        spreadsheetId: "../../etc/passwd",
        accessToken: "token",
        now: NOW,
        fetchImpl,
      }),
    ).rejects.toThrow("invalid_spreadsheet_id");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
