import type { FirestoreWriteClient } from "./firestoreRest";
import { isValidPathSegment } from "./pathSegment";
import { buildTaskBoardPayload, parseRoutineRows, parseTaskRows } from "../../src/taskBoard";

/** タスク表のタブ名。シート側で変えたらここも変える（見つからなければ同期は失敗する）。 */
const TASK_SHEET_TITLE = "タスク一覧";
const ROUTINE_SHEET_TITLE = "定例業務（毎週・毎日など）";
/** 列はヘッダー名で探すので、範囲は広めに取る。 */
const READ_COLUMNS = "A:Z";

/** Google のファイルIDとして通る文字だけを許可する。URLへ埋め込む前に弾く。 */
const SPREADSHEET_ID = /^[a-zA-Z0-9_-]{20,}$/;

export interface SyncTaskBoardParams {
  firestore: Pick<FirestoreWriteClient, "setDocument">;
  groupId: string;
  spreadsheetId: string;
  accessToken: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface SyncTaskBoardResult {
  taskCount: number;
  routineCount: number;
}

type ValueRange = { values?: string[][] };

async function readTabs(spreadsheetId: string, accessToken: string, fetchImpl: typeof fetch): Promise<ValueRange[]> {
  const ranges = [TASK_SHEET_TITLE, ROUTINE_SHEET_TITLE]
    .map((title) => `ranges=${encodeURIComponent(`'${title}'!${READ_COLUMNS}`)}`)
    .join("&");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${ranges}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Sheets batchGet failed: ${response.status}`);
  const body = (await response.json()) as { valueRanges?: ValueRange[] };
  return body.valueRanges ?? [];
}

/**
 * タスク表を読み、アプリが閲覧する `groups/{gid}/taskBoard/current` を書き直す。
 *
 * 内容が同じでも毎回書く。`syncedAt` が進まないと、アプリの「同期が止まっている」
 * 注意が誤って出るため。15分に1回なので書き込み量は1日96回に収まる。
 * シートの構造が変わって読めないときは書かずに失敗させ、古い内容を残したまま Cron の履歴に残す。
 */
export async function syncTaskBoard({
  firestore,
  groupId,
  spreadsheetId,
  accessToken,
  now = new Date(),
  fetchImpl = fetch,
}: SyncTaskBoardParams): Promise<SyncTaskBoardResult> {
  if (!isValidPathSegment(groupId)) throw new Error("invalid group id");
  if (!SPREADSHEET_ID.test(spreadsheetId)) throw new Error("invalid spreadsheet id");

  const [taskRange, routineRange] = await readTabs(spreadsheetId, accessToken, fetchImpl);
  const tasks = parseTaskRows(taskRange?.values ?? []);
  const routines = parseRoutineRows(routineRange?.values ?? []);

  await firestore.setDocument(`groups/${groupId}/taskBoard/current`, {
    syncedAt: now.getTime(),
    sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    payload: buildTaskBoardPayload({ tasks, routines }),
  });
  return { taskCount: tasks.length, routineCount: routines.length };
}
