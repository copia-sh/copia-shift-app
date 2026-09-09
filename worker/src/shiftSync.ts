import { buildShiftSyncPayloads } from "./agentShifts";
import type { FirestoreClient } from "./firestoreRest";
import { toJstDateKey } from "./feed";

const SYNC_DAYS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SHEET_TITLE = "シフト同期";
const HEADER_ROW = ["更新日時", "日付", "氏名", "勤務開始", "勤務終了", "勤務区分", "同期状態"];

/** Google のファイルIDとして通る文字だけを許可する。URLへ埋め込む前に弾く。 */
const SPREADSHEET_ID = /^[a-zA-Z0-9_-]{20,}$/;

export interface SyncShiftSheetParams {
  firestore: FirestoreClient;
  groupId: string;
  spreadsheetId: string;
  accessToken: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

function jstTimestamp(now: Date): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${toJstDateKey(now)} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())} JST`;
}

function datesForSync(now: Date): string[] {
  return Array.from({ length: SYNC_DAYS }, (_, offset) => toJstDateKey(new Date(now.getTime() + offset * MS_PER_DAY)));
}

async function expectOk(response: Response, action: string): Promise<Response> {
  if (!response.ok) throw new Error(`Google Sheets ${action} failed: ${response.status}`);
  return response;
}

/**
 * `シフト同期` タブが無ければ作る。
 *
 * 存在しないタブへ書き込むと Sheets API は 400 を返す。初回有効化時に必ず踏むため、
 * 手順書での「タブを先に作っておく」に頼らず、ここで自動的に用意する。
 */
async function ensureSheetExists(
  baseUrl: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await expectOk(
    await fetchImpl(`${baseUrl}?fields=sheets.properties.title`, { headers }),
    "read",
  );
  const body = (await response.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  const exists = (body.sheets ?? []).some((sheet) => sheet.properties?.title === SHEET_TITLE);
  if (exists) return;

  await expectOk(
    await fetchImpl(`${baseUrl}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_TITLE } } }] }),
    }),
    "addSheet",
  );
}

/**
 * エージェントが読む最小限のシフト一覧を `シフト同期` タブへ丸ごと置換する。
 *
 * 前回より行数が減っても古い行が残らないよう、行数を決め打ちせず A:G 列全体を
 * clear してから、ヘッダを含む全件を書き直す。
 */
export async function syncShiftSheet({
  firestore,
  groupId,
  spreadsheetId,
  accessToken,
  now = new Date(),
  fetchImpl = fetch,
}: SyncShiftSheetParams): Promise<{ rowCount: number }> {
  if (!SPREADSHEET_ID.test(spreadsheetId)) throw new Error("invalid_spreadsheet_id");

  const shifts = await buildShiftSyncPayloads({ firestore, groupId, dates: datesForSync(now) });
  const updatedAt = jstTimestamp(now);
  const values = [
    HEADER_ROW,
    ...shifts.map((shift) => [
      updatedAt,
      shift.date,
      shift.name,
      shift.workStart ?? "",
      shift.workEnd ?? "",
      shift.labels.join("、"),
      "同期済み",
    ]),
  ];

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  await ensureSheetExists(baseUrl, headers, fetchImpl);

  const dataRange = encodeURIComponent(`'${SHEET_TITLE}'!A:G`);
  await expectOk(
    await fetchImpl(`${baseUrl}/values/${dataRange}:clear`, { method: "POST", headers, body: "{}" }),
    "clear",
  );

  const startCell = encodeURIComponent(`'${SHEET_TITLE}'!A1`);
  await expectOk(
    await fetchImpl(`${baseUrl}/values/${startCell}?valueInputOption=RAW`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ values }),
    }),
    "write",
  );

  return { rowCount: shifts.length };
}
