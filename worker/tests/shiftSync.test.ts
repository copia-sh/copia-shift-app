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

/**
 * Sheets API の代わり。呼ばれた順ではなくURLで応答する。
 *
 * 順番に積む方式だと、書き込み先が増えるたびに全テストの件数を直すことになり、
 * 何を確かめたいテストなのかが読めなくなる。
 */
function sheetsFetch(options: { tabs?: string[]; failOn?: (url: string) => number | null } = {}) {
  const tabs = options.tabs ?? ["シフト同期", "シフト月間表"];
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const status = options.failOn?.(url);
    if (status) return new Response(null, { status });
    if (url.includes(":clear") || url.includes(":batchUpdate") || url.includes("valueInputOption")) {
      return new Response("{}", { status: 200 });
    }
    return new Response(
      JSON.stringify({ sheets: tabs.map((title) => ({ properties: { title } })) }),
      { status: 200 },
    );
  });
}

type SheetsFetch = ReturnType<typeof sheetsFetch>;

const SHEET_ID = "1TestSpreadsheetIdForUnitTests_00";
const MATRIX_SHEET_ID = "1TestMatrixSpreadsheetIdForUnit_01";
const NOW = new Date("2026-09-09T00:00:00.000Z");

function run(fetchImpl: SheetsFetch, extra: Partial<Parameters<typeof syncShiftSheet>[0]> = {}) {
  return syncShiftSheet({
    firestore,
    groupId: "g1",
    spreadsheetId: SHEET_ID,
    accessToken: "token",
    now: NOW,
    fetchImpl,
    ...extra,
  });
}

/** 月間表も書く実行（毎時0分・30分の Cron 相当） */
const runWithMatrix = (fetchImpl: SheetsFetch, extra = {}) =>
  run(fetchImpl, { includeMatrix: true, ...extra });

const urlsOf = (fetchImpl: SheetsFetch) => fetchImpl.mock.calls.map(([url]) => String(url));

/** 指定タブへ書き込んだ内容（values）。書いていなければ null。 */
function writtenValues(fetchImpl: SheetsFetch, title: string, spreadsheetId = SHEET_ID) {
  const call = fetchImpl.mock.calls.find(
    ([url]) =>
      String(url).includes(spreadsheetId) &&
      String(url).includes(encodeURIComponent(`'${title}'!A1`)),
  );
  return call ? (JSON.parse(call[1]?.body as string).values as string[][]) : null;
}

describe("syncShiftSheet", () => {
  it("列全体を消してから、JSTの更新日時つきで一覧を書く", async () => {
    const fetchImpl = sheetsFetch();

    await expect(run(fetchImpl)).resolves.toEqual({ rowCount: 16, matrixRowCount: 0 });

    // 行数が減ったときに古い行が残らないよう、行数を決め打ちせず列全体を消す。
    const clear = fetchImpl.mock.calls.find(([url]) => String(url).includes(":clear"));
    expect(String(clear?.[0])).toContain(encodeURIComponent("'シフト同期'!A:G"));
    expect(clear?.[1]).toMatchObject({ method: "POST" });

    const rows = writtenValues(fetchImpl, "シフト同期");
    expect(rows?.[0]).toEqual(["更新日時", "日付", "氏名", "勤務開始", "勤務終了", "勤務区分", "同期状態"]);
    expect(rows?.[1]).toEqual(["2026-09-09 09:00:00 JST", "2026-09-09", "田村 駿貴", "10:00", "18:00", "出勤", "同期済み"]);
  });

  it("タブが無ければ作る（初回は書き込みが400で落ちるため）", async () => {
    const fetchImpl = sheetsFetch({ tabs: ["更新履歴"] });

    await expect(runWithMatrix(fetchImpl)).resolves.toEqual({ rowCount: 16, matrixRowCount: 2 });

    const added = fetchImpl.mock.calls
      .filter(([url]) => String(url).includes(":batchUpdate"))
      .flatMap(([, init]) => JSON.parse(init?.body as string).requests)
      .map((request: { addSheet: { properties: { title: string } } }) => request.addSheet.properties.title);
    expect(added).toEqual(["シフト同期", "シフト月間表"]);
  });

  it("タブが揃っていれば作らない", async () => {
    const fetchImpl = sheetsFetch();

    await runWithMatrix(fetchImpl);

    expect(urlsOf(fetchImpl).some((url) => url.includes(":batchUpdate"))).toBe(false);
  });

  it("月間表を書かない実行では、月間表タブに触れない", async () => {
    const fetchImpl = sheetsFetch();

    await expect(run(fetchImpl)).resolves.toEqual({ rowCount: 16, matrixRowCount: 0 });

    expect(urlsOf(fetchImpl).some((url) => url.includes(encodeURIComponent("シフト月間表")))).toBe(false);
  });

  it("メンバー×日付の月間表を、30日分の別タブへ書く", async () => {
    const fetchImpl = sheetsFetch();

    await runWithMatrix(fetchImpl);

    const clear = fetchImpl.mock.calls.find(
      ([url]) => String(url).includes(":clear") && String(url).includes(encodeURIComponent("シフト月間表")),
    );
    expect(String(clear?.[0])).toContain(encodeURIComponent("'シフト月間表'!A:AE"));

    const rows = writtenValues(fetchImpl, "シフト月間表")!;
    expect(rows[0][0]).toBe("更新日時");
    expect(rows[0][1]).toBe("2026-09-09 09:00:00 JST");

    // 2行目は日付。30日分ぶん並ぶ
    expect(rows[1][0]).toBe("氏名");
    expect(rows[1]).toHaveLength(31);
    expect(rows[1][1]).toBe("9/9(水)");
    expect(rows[1][30]).toBe("10/8(木)");

    // 3行目以降が1人1行。シフト表対象外・退会者は出ない
    expect(rows.slice(2).map((row) => row[0])).toEqual(["田村 駿貴", "曽根"]);
    expect(rows[2][1]).toBe("10:00-18:00");
    // 同じ日の複数枠はカンマ区切り。リモートは (リ) を付ける
    expect(rows[2][2]).toBe("9:00-13:00,14:00-18:00(リ)");
    // 却下された枠はセルに出さない（全置換なので次の同期で消える）
    expect(rows[3][3]).toBe("");
  });

  it("単体スプレッドシートが設定されていれば、同じ月間表をそちらにも書く", async () => {
    const fetchImpl = sheetsFetch();

    await runWithMatrix(fetchImpl, { matrixSpreadsheetId: MATRIX_SHEET_ID });

    // 片方だけ古い内容が残ると、共有先が誤った予定を見ることになる
    const shared = writtenValues(fetchImpl, "シフト月間表", MATRIX_SHEET_ID);
    expect(shared).toEqual(writtenValues(fetchImpl, "シフト月間表"));
    expect(shared?.[1]).toHaveLength(31);
  });

  it("単体スプレッドシートには一覧タブを書かない（共有用に月間表だけ置く）", async () => {
    const fetchImpl = sheetsFetch();

    await runWithMatrix(fetchImpl, { matrixSpreadsheetId: MATRIX_SHEET_ID });

    expect(writtenValues(fetchImpl, "シフト同期", MATRIX_SHEET_ID)).toBeNull();
  });

  it("月間表を書かない実行では、単体スプレッドシートにも触れない", async () => {
    const fetchImpl = sheetsFetch();

    await run(fetchImpl, { matrixSpreadsheetId: MATRIX_SHEET_ID });

    expect(urlsOf(fetchImpl).some((url) => url.includes(MATRIX_SHEET_ID))).toBe(false);
  });

  it("単体スプレッドシートのIDが不正なら書かない", async () => {
    const fetchImpl = sheetsFetch();

    await expect(
      runWithMatrix(fetchImpl, { matrixSpreadsheetId: "../../etc/passwd" }),
    ).rejects.toThrow("invalid_matrix_spreadsheet_id");
  });

  it("読み取りに失敗したら落ちる（黙って古い表を残さない）", async () => {
    const fetchImpl = sheetsFetch({ failOn: (url) => (url.includes(":clear") ? null : 403) });

    await expect(run(fetchImpl)).rejects.toThrow(/403/);
  });

  it("書き込みを拒否されたら落ちる", async () => {
    const fetchImpl = sheetsFetch({ failOn: (url) => (url.includes("valueInputOption") ? 500 : null) });

    await expect(run(fetchImpl)).rejects.toThrow(/500/);
  });

  it("Googleのファイルidとして通らない値は、1度も通信せずに弾く", async () => {
    const fetchImpl = sheetsFetch();

    await expect(run(fetchImpl, { spreadsheetId: "../../etc/passwd" })).rejects.toThrow(
      "invalid_spreadsheet_id",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
