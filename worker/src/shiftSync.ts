import { buildShiftSyncPayloads, type ShiftSyncPayload } from "./agentShifts";
import type { FirestoreClient } from "./firestoreRest";
import { toJstDateKey } from "./feed";
import { buildShiftMatrix, matrixDates, matrixKey } from "./shiftMatrix";
import { REJECTED_TYPE } from "../../src/types";
import { formatSpreadsheetSegment } from "../../src/utils/ical";

const SYNC_DAYS = 8;
/** 月間表の対象日数。他チームと調整するのに必要な先の分だけ持つ。 */
const MATRIX_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SHEET_TITLE = "シフト同期";
const MATRIX_SHEET_TITLE = "シフト月間表";
const HEADER_ROW = ["更新日時", "日付", "氏名", "勤務開始", "勤務終了", "勤務区分", "同期状態"];
/** 月間表の列数。日付30列＋氏名列。clear の範囲を決めるのに使う。 */
const MATRIX_LAST_COLUMN = "AE";

/** Google のファイルIDとして通る文字だけを許可する。URLへ埋め込む前に弾く。 */
const SPREADSHEET_ID = /^[a-zA-Z0-9_-]{20,}$/;

export interface SyncShiftSheetParams {
  firestore: FirestoreClient;
  groupId: string;
  spreadsheetId: string;
  accessToken: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  /**
   * 月間表（30日分）も書くか。既定は書かない。
   *
   * 30日分の読み取りを5分ごとに行うとFirestoreの無料枠を超えるので、
   * 人が読む月間表だけ頻度を落とす（README「読み取り量の目安」）。
   */
  includeMatrix?: boolean;
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
  titles: readonly string[],
): Promise<void> {
  const response = await expectOk(
    await fetchImpl(`${baseUrl}?fields=sheets.properties.title`, { headers }),
    "read",
  );
  const body = (await response.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  const existing = new Set((body.sheets ?? []).map((sheet) => sheet.properties?.title));
  const missing = titles.filter((title) => !existing.has(title));
  if (missing.length === 0) return;

  await expectOk(
    await fetchImpl(`${baseUrl}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    }),
    "addSheet",
  );
}

/** タブ全体を消してから書き直す。行数を決め打ちしないので、減った行が残らない。 */
async function replaceSheetValues({
  baseUrl,
  headers,
  fetchImpl,
  title,
  range,
  values,
}: {
  baseUrl: string;
  headers: Record<string, string>;
  fetchImpl: typeof fetch;
  title: string;
  range: string;
  values: string[][];
}): Promise<void> {
  await expectOk(
    await fetchImpl(`${baseUrl}/values/${encodeURIComponent(`'${title}'!${range}`)}:clear`, {
      method: "POST",
      headers,
      body: "{}",
    }),
    "clear",
  );

  await expectOk(
    await fetchImpl(
      `${baseUrl}/values/${encodeURIComponent(`'${title}'!A1`)}?valueInputOption=RAW`,
      { method: "PUT", headers, body: JSON.stringify({ values }) },
    ),
    "write",
  );
}

/**
 * 月間表の1セル。同じ日に複数の枠があればカンマ区切りで並べる。
 *
 * 却下された枠は出さない。全置換で書き直すので、却下に変わった枠は次の同期で
 * セルから消える（表に残り続けない）。
 */
function matrixCell(payload: ShiftSyncPayload): string {
  return payload.segments
    .filter((segment) => segment.type !== REJECTED_TYPE)
    .map((segment) =>
      formatSpreadsheetSegment({
        label: segment.label,
        startTime: segment.startTime,
        endTime: segment.endTime,
      }),
    )
    .join(",");
}

/**
 * スプレッドシートの2つのタブを丸ごと置換する。
 *
 * - `シフト同期`: エージェントが読む最小限の一覧（1行1シフト、8日分）
 * - `シフト月間表`: 人が読むメンバー×日付の表（30日分）
 *
 * どちらも前回より行数が減っても古い行が残らないよう、行数を決め打ちせず
 * タブ全体を clear してから書き直す。却下や削除で消えた予定は、これで消える。
 */
export async function syncShiftSheet({
  firestore,
  groupId,
  spreadsheetId,
  accessToken,
  now = new Date(),
  fetchImpl = fetch,
  includeMatrix = false,
}: SyncShiftSheetParams): Promise<{ rowCount: number; matrixRowCount: number }> {
  if (!SPREADSHEET_ID.test(spreadsheetId)) throw new Error("invalid_spreadsheet_id");

  // 月間表を書くときだけ30日分を読む。一覧タブはその先頭8日分を使うので、
  // 同じデータをCronのたびに2回取りにいくことはない。
  const dates = matrixDates(now, includeMatrix ? MATRIX_DAYS : SYNC_DAYS);
  const shifts = await buildShiftSyncPayloads({ firestore, groupId, dates });
  const updatedAt = jstTimestamp(now);

  const listDates = new Set(datesForSync(now));
  const listRows = shifts.filter((shift) => listDates.has(shift.date));
  const values = [
    HEADER_ROW,
    ...listRows.map((shift) => [
      updatedAt,
      shift.date,
      shift.name,
      shift.workStart ?? "",
      shift.workEnd ?? "",
      shift.labels.join("、"),
      "同期済み",
    ]),
  ];

  // 氏名の並びは最初に現れた順。日付ごとに同じ順で組み立てられているので、
  // 表の行の並びは同期のたびに変わらない。
  const names = [...new Set(shifts.map((shift) => shift.name))];

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  await ensureSheetExists(
    baseUrl,
    headers,
    fetchImpl,
    includeMatrix ? [SHEET_TITLE, MATRIX_SHEET_TITLE] : [SHEET_TITLE],
  );

  await replaceSheetValues({
    baseUrl,
    headers,
    fetchImpl,
    title: SHEET_TITLE,
    range: "A:G",
    values,
  });
  if (!includeMatrix) return { rowCount: listRows.length, matrixRowCount: 0 };

  const cells = new Map(
    shifts
      .map((shift) => [matrixKey(shift.name, shift.date), matrixCell(shift)] as const)
      .filter(([, cell]) => cell !== ""),
  );
  await replaceSheetValues({
    baseUrl,
    headers,
    fetchImpl,
    title: MATRIX_SHEET_TITLE,
    range: `A:${MATRIX_LAST_COLUMN}`,
    values: buildShiftMatrix({ dates, names, cells, updatedAt }),
  });

  return { rowCount: listRows.length, matrixRowCount: names.length };
}
