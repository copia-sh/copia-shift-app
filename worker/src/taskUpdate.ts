import { TASK_STATUSES } from "../../src/taskBoard";

/**
 * アプリからのタスク進捗の更新を、タスク表の該当セルへの書き込みに変える。
 * 承認は挟まず即時に反映する運用なので、書ける項目・値・長さをここで絞る。
 */

export type TaskKind = "task" | "routine";

export interface TaskUpdate {
  kind: TaskKind;
  /** タスク一覧の No（定例業務は空） */
  no: string;
  /** 行の特定に使う、今のタスク内容 */
  title: string;
  status?: string;
  /** 状況メモに追記する文 */
  memo?: string;
  /** 最新の成果物（置き換え） */
  deliverable?: string;
}

export type ParseResult =
  | { ok: true; value: TaskUpdate }
  | { ok: false; error: "invalid_target" | "invalid_status" | "memo_too_long" | "deliverable_too_long" | "nothing_to_update" };

const MAX_TITLE = 300;
const MAX_MEMO = 1000;
const MAX_DELIVERABLE = 500;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

/**
 * 成果物欄は日付の前置きが付かず、利用者の入力がそのままセルの先頭になる。
 * シート内は RAW なので数式にならないが、CSV/Excel に書き出して開くと実行されうるため、
 * 数式の記号で始まるときは ' を付けて文字列として扱わせる（状況メモは必ず日付で始まるので不要）。
 */
function neutralizeLeadingFormula(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

export function parseTaskUpdate(body: unknown): ParseResult {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const kind = record.kind;
  const title = text(record.title);
  if ((kind !== "task" && kind !== "routine") || !title || title.length > MAX_TITLE) {
    return { ok: false, error: "invalid_target" };
  }
  const status = text(record.status);
  if (status && !(TASK_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "invalid_status" };
  const memo = text(record.memo);
  if (memo.length > MAX_MEMO) return { ok: false, error: "memo_too_long" };
  const deliverable = text(record.deliverable);
  if (deliverable.length > MAX_DELIVERABLE) return { ok: false, error: "deliverable_too_long" };
  if (!status && !memo && !deliverable) return { ok: false, error: "nothing_to_update" };

  return {
    ok: true,
    value: {
      kind,
      no: text(record.no),
      title,
      ...(status && { status }),
      ...(memo && { memo }),
      ...(deliverable && { deliverable: neutralizeLeadingFormula(deliverable) }),
    },
  };
}

/** 0始まりの列番号 → A1表記の列名。 */
export function columnLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export interface CellWrite {
  range: string;
  value: string;
}

export type RowUpdateResult =
  | { ok: true; cells: CellWrite[] }
  | { ok: false; error: "row_not_found" | "ambiguous_row" | "column_missing" };

type Row = readonly (string | undefined)[];

const cell = (row: Row, index: number) => (index < 0 ? "" : (row[index] ?? "").trim());
/** 行の特定用。送信側（parseTaskUpdate）と同じく、改行・連続した空白を1つにまとめて比べる。 */
const key = (row: Row, index: number) => cell(row, index).replace(/\s+/gu, " ");

/**
 * 書き込むセルを決める。行は「タスク内容」（タスクは No も）が一致する1行に限る。
 * 送信までの間にシートが書き換わって見つからない・複数あるときは、別の行を壊さないよう書かない。
 * 状況メモは上書きせず「YYYY-MM-DD: 本文（名前）」を末尾に足す（アプリの状況メモ表示が日付で区切る形式）。
 */
export function buildRowUpdates(rows: readonly Row[], update: TaskUpdate, authorName: string, dateKey: string): RowUpdateResult {
  const header = (rows[0] ?? []).map((name) => (name ?? "").trim());
  const col = (name: string) => header.indexOf(name);
  const titleCol = col("タスク内容");
  const noCol = col("No");
  const statusCol = col("ステータス");
  const memoCol = col("状況メモ");
  const deliverableCol = col("最新の成果物");
  if (
    titleCol < 0 ||
    (update.kind === "task" && noCol < 0) ||
    (update.status && statusCol < 0) ||
    (update.memo && memoCol < 0) ||
    (update.deliverable && deliverableCol < 0)
  ) {
    return { ok: false, error: "column_missing" };
  }

  const matches = rows
    .map((row, index) => ({ row, index }))
    .slice(1)
    .filter(({ row }) => key(row, titleCol) === update.title && (update.kind === "routine" || key(row, noCol) === update.no));
  if (matches.length === 0) return { ok: false, error: "row_not_found" };
  if (matches.length > 1) return { ok: false, error: "ambiguous_row" };

  const { row, index } = matches[0];
  const rowNumber = index + 1;
  const cells: CellWrite[] = [];
  if (update.status) cells.push({ range: `${columnLetter(statusCol)}${rowNumber}`, value: update.status });
  if (update.memo) {
    const current = cell(row, memoCol);
    const entry = `${dateKey}: ${update.memo}（${authorName}）`;
    cells.push({ range: `${columnLetter(memoCol)}${rowNumber}`, value: current ? `${current} ${entry}` : entry });
  }
  if (update.deliverable) cells.push({ range: `${columnLetter(deliverableCol)}${rowNumber}`, value: update.deliverable });
  return { ok: true, cells };
}
