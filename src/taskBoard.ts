/**
 * タスク表（Googleスプレッドシート「スタダチーム_タスク表」）の閲覧用データ。
 *
 * 正本はシートで、アプリは閲覧だけする。Worker がシートを読んでここの関数で正規化し、
 * Firestore の `groups/{gid}/taskBoard/current` に保存する。アプリは同じ関数で読み戻す。
 * Firebase にも DOM にも依存しない純粋関数だけを置き、Worker とアプリの両方から使う。
 */
import { normalizeMemberName } from "./utils/memberName";

export interface BoardTask {
  no: string;
  phase: string;
  title: string;
  purpose: string;
  assignees: string[];
  due: string;
  priority: string;
  status: string;
  memo: string;
  deliverable: string;
}

export interface BoardRoutine {
  frequency: string;
  title: string;
  purpose: string;
  assignees: string[];
  status: string;
  memo: string;
  deliverable: string;
}

export interface TaskBoard {
  /** Worker がシートを読んだ時刻（ミリ秒） */
  syncedAt: number;
  /** 編集用に開くシートのURL。検証に通らなければ空文字 */
  sourceUrl: string;
  tasks: BoardTask[];
  routines: BoardRoutine[];
}

/** この時間より前の同期は「止まっているかもしれない」と注意を出す。 */
export const TASK_BOARD_STALE_MS = 60 * 60 * 1000;

/** アプリから選べるステータス。シートで使っている値だけに絞る（任意の文字列は書かせない）。 */
export const TASK_STATUSES = ["未着手", "検討中", "進行中", "練習中", "運用中", "未整備", "完了"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const UNASSIGNED = "未定";
const EVERYONE_PREFIX = "全員";

// ---- シートの行 → タスク ----------------------------------------------------

type Row = readonly (string | undefined)[];

/** シートのヘッダー名。列の並びが変わっても読めるよう、位置ではなく名前で探す。 */
const TASK_COLUMNS = {
  no: "No",
  phase: "フェーズ",
  title: "タスク内容",
  purpose: "背景・目的",
  assignees: "担当インターン生",
  due: "期限目安",
  priority: "優先度",
  status: "ステータス",
  memo: "状況メモ",
  deliverable: "最新の成果物",
} as const;

const ROUTINE_COLUMNS = {
  frequency: "頻度",
  title: "タスク内容",
  purpose: "目的",
  assignees: "担当インターン生",
  status: "ステータス",
  memo: "状況メモ",
  deliverable: "最新の成果物",
} as const;

/** これが無いシートは構造が変わったとみなして同期を失敗させる（黙って空にしない）。 */
const REQUIRED_COLUMNS = ["タスク内容", "ステータス"] as const;

type ColumnIndex<K extends string> = Record<K, number>;

function indexColumns<K extends string>(header: Row | undefined, columns: Record<K, string>): ColumnIndex<K> {
  const names = (header ?? []).map((cell) => (cell ?? "").trim());
  for (const required of REQUIRED_COLUMNS) {
    if (!names.includes(required)) throw new Error(`タスク表に「${required}」列が見つかりません`);
  }
  const entries = Object.entries(columns) as [K, string][];
  return Object.fromEntries(entries.map(([key, name]) => [key, names.indexOf(name)])) as ColumnIndex<K>;
}

function cellAt(row: Row, index: number): string {
  return index < 0 ? "" : (row[index] ?? "").trim();
}

/** 担当者欄を人ごとに分ける。「（共同）」は全員に付く注記なので落とし、「（着手）」などは残す。 */
export function splitAssignees(raw: string): string[] {
  const names = raw
    .split(/[・、,]/u)
    .map((name) => name.replace(/[（(]共同[）)]/gu, "").trim())
    .filter(Boolean);
  return names.length > 0 ? names : [UNASSIGNED];
}

export function parseTaskRows(rows: readonly Row[]): BoardTask[] {
  const col = indexColumns(rows[0], TASK_COLUMNS);
  return rows.slice(1).flatMap((row) => {
    const title = cellAt(row, col.title);
    if (!title) return [];
    return [{
      no: cellAt(row, col.no),
      phase: cellAt(row, col.phase),
      title,
      purpose: cellAt(row, col.purpose),
      assignees: splitAssignees(cellAt(row, col.assignees)),
      due: cellAt(row, col.due),
      priority: cellAt(row, col.priority),
      status: cellAt(row, col.status),
      memo: cellAt(row, col.memo),
      deliverable: cellAt(row, col.deliverable),
    }];
  });
}

export function parseRoutineRows(rows: readonly Row[]): BoardRoutine[] {
  const col = indexColumns(rows[0], ROUTINE_COLUMNS);
  return rows.slice(1).flatMap((row) => {
    const title = cellAt(row, col.title);
    if (!title) return [];
    return [{
      frequency: cellAt(row, col.frequency),
      title,
      purpose: cellAt(row, col.purpose),
      assignees: splitAssignees(cellAt(row, col.assignees)),
      status: cellAt(row, col.status),
      memo: cellAt(row, col.memo),
      deliverable: cellAt(row, col.deliverable),
    }];
  });
}

// ---- 担当の判定 --------------------------------------------------------------

function assigneeKey(assignee: string): string {
  return normalizeMemberName(assignee.replace(/[（(].*?[）)]/gu, ""));
}

/**
 * シートの担当者名（姓だけのことが多い）が、ログイン中メンバーの表示名に当たるか。
 * 表示名は「田村駿貴」「田村 駿貴」のどちらもあるので、正規化した表示名の先頭一致で見る。
 * 「全員〜」は誰の担当にもなる。
 */
export function isAssignedTo(assignees: readonly string[], displayName: string): boolean {
  const me = normalizeMemberName(displayName);
  if (!me) return false;
  return assignees.some((assignee) => {
    if (assignee.startsWith(EVERYONE_PREFIX)) return true;
    const key = assigneeKey(assignee);
    return key !== "" && key !== UNASSIGNED && me.startsWith(key);
  });
}

/**
 * 担当者名に当たるメンバーを1人だけ返す（アイコンの色に使う）。
 * 同じ姓が複数いるなど1人に決まらないときは null にして、別人の色で出さない。
 */
export function findMemberForAssignee<T extends { displayName: string }>(
  assignee: string,
  members: readonly T[],
): T | null {
  const key = assigneeKey(assignee);
  if (!key || key === UNASSIGNED || assignee.startsWith(EVERYONE_PREFIX)) return null;
  const matches = members.filter((member) => normalizeMemberName(member.displayName).startsWith(key));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * 氏名での絞り込み。担当者名に含まれるか、名前の合うメンバーの担当かで見る。
 * シートの担当は姓だけのことが多いので、「広幸」のような名前でもメンバーの表示名経由で当てる。
 */
export function matchesNameQuery(assignees: readonly string[], query: string, memberNames: readonly string[]): boolean {
  const q = normalizeMemberName(query);
  if (!q) return true;
  if (assignees.some((assignee) => assigneeKey(assignee).includes(q))) return true;
  return memberNames
    .filter((name) => normalizeMemberName(name).includes(q))
    .some((name) => isAssignedTo(assignees, name));
}

export function isUnassigned(assignees: readonly string[]): boolean {
  return assignees.every((assignee) => assignee === UNASSIGNED);
}

// ---- 詳細表示用 --------------------------------------------------------------

export interface MemoEntry {
  /** `YYYY-MM-DD`。日付の付かない前置きは null */
  date: string | null;
  text: string;
}

const MEMO_DATE = /(\d{4}-\d{2}-\d{2})(?:[ 　]+\d{1,2}:\d{2}(?:[ 　]*JST)?)?[ 　]*[:：][ 　]*/gu;

/** 状況メモは「2026-09-20: …」の追記が続く形式なので、日付ごとに分ける。 */
export function splitMemo(memo: string): MemoEntry[] {
  const matches = [...memo.matchAll(MEMO_DATE)];
  const entries: MemoEntry[] = [];
  const lead = memo.slice(0, matches[0]?.index ?? memo.length).trim();
  if (lead) entries.push({ date: null, text: lead });
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? memo.length;
    const text = memo.slice(start, end).trim();
    if (text) entries.push({ date: match[1], text });
  });
  return entries;
}

export interface DeliverableLink {
  label: string;
  /** http(s) のときだけ入る。それ以外は名前だけ表示する */
  url: string | null;
  host: string | null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'）)]+/gu;

function lastPathSegment(url: URL): string {
  const segment = url.pathname.split("/").filter(Boolean).pop();
  if (!segment) return url.host;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function linksInLine(line: string): DeliverableLink[] {
  const links: DeliverableLink[] = [];
  let cursor = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    const before = line.slice(cursor, index).trim();
    cursor = index + match[0].length;
    let url: URL;
    try {
      url = new URL(match[0]);
    } catch {
      continue;
    }
    links.push({ label: before || lastPathSegment(url), url: url.href, host: url.host });
  }
  const rest = line.slice(cursor).trim();
  if (rest) links.push({ label: rest, url: null, host: null });
  return links;
}

/** 成果物欄（ファイル名・URL・「名前 URL」が混在）を、表示できるリンクの並びにする。 */
export function parseDeliverables(text: string): DeliverableLink[] {
  return text.split(/\r?\n/u).flatMap(linksInLine);
}

export function isStale(syncedAt: number, now: number): boolean {
  return now - syncedAt >= TASK_BOARD_STALE_MS;
}

// ---- Firestore との受け渡し --------------------------------------------------

/**
 * Firestore には `payload` に JSON 文字列として入れる。
 * Worker の REST クライアントに入れ子の map/array の書き込みを足さずに済み、
 * 1ドキュメントなので画面を開くたびの読み取りも1回で済む。
 */
export function buildTaskBoardPayload(board: Pick<TaskBoard, "tasks" | "routines">): string {
  return JSON.stringify({ tasks: board.tasks, routines: board.routines });
}

const SHEET_URL_PREFIX = "https://docs.google.com/spreadsheets/";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function assigneesFrom(value: unknown): string[] {
  const names = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
  return names.length > 0 ? names : [UNASSIGNED];
}

function toTask(raw: unknown): BoardTask {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    no: str(r.no), phase: str(r.phase), title: str(r.title), purpose: str(r.purpose),
    assignees: assigneesFrom(r.assignees), due: str(r.due), priority: str(r.priority),
    status: str(r.status), memo: str(r.memo), deliverable: str(r.deliverable),
  };
}

function toRoutine(raw: unknown): BoardRoutine {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    frequency: str(r.frequency), title: str(r.title), purpose: str(r.purpose),
    assignees: assigneesFrom(r.assignees), status: str(r.status), memo: str(r.memo),
    deliverable: str(r.deliverable),
  };
}

/** Firestore のドキュメントを検証して TaskBoard にする。読めなければ null。 */
export function parseTaskBoardDoc(data: unknown): TaskBoard | null {
  if (!data || typeof data !== "object") return null;
  const { syncedAt, sourceUrl, payload } = data as Record<string, unknown>;
  if (typeof syncedAt !== "number" || typeof payload !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { tasks, routines } = parsed as Record<string, unknown>;
  return {
    syncedAt,
    sourceUrl: typeof sourceUrl === "string" && sourceUrl.startsWith(SHEET_URL_PREFIX) ? sourceUrl : "",
    tasks: Array.isArray(tasks) ? tasks.map(toTask) : [],
    routines: Array.isArray(routines) ? routines.map(toRoutine) : [],
  };
}

// ---- 画面の状態 --------------------------------------------------------------

export type TaskBoardState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ready"; board: TaskBoard };

/** 購読結果を画面の状態にする。ドキュメントが無い＝Workerがまだ一度も同期していない。 */
export function boardStateFromSnapshot(exists: boolean, data: unknown): TaskBoardState {
  if (!exists) return { kind: "missing" };
  const board = parseTaskBoardDoc(data);
  return board ? { kind: "ready", board } : { kind: "error" };
}

export function boardStateFromError(error: unknown): TaskBoardState {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "permission-denied" ? { kind: "denied" } : { kind: "error" };
}

// ---- 絞り込み ----------------------------------------------------------------

/** 完了したタスクは一覧に出さない（シート側でも完了済みタブへ移す運用）。 */
export const DONE_STATUS = "完了";

export type TaskScope = "mine" | "all";

/** 画面で選ぶ「表示する担当」。自分・全員のほか、メンバーのIDで特定の人を選べる。 */
export type ScopeChoice = "mine" | "all" | (string & {});

export interface ResolvedScope {
  scope: TaskScope;
  /** 担当の判定に使う表示名。特定の人を選んだときはその人 */
  displayName: string;
  label: string;
}

/**
 * 選んだ担当を絞り込み条件にする。特定の人は「自分」と同じ判定をその人の表示名で行う。
 * 退会などで選んでいた人がいなくなったら、何も出ない状態にせず全員に戻す。
 */
export function resolveScope<T extends { id: string; displayName: string }>(
  choice: ScopeChoice,
  currentMember: T,
  members: readonly T[],
): ResolvedScope {
  if (choice === "mine") return { scope: "mine", displayName: currentMember.displayName, label: "自分" };
  const person = choice === "all" ? undefined : members.find((member) => member.id === choice);
  return person
    ? { scope: "mine", displayName: person.displayName, label: person.displayName }
    : { scope: "all", displayName: currentMember.displayName, label: "全員" };
}

export interface BoardFilter {
  scope: TaskScope;
  displayName: string;
  /** null はすべてのステータス */
  statuses: ReadonlySet<string> | null;
}

interface FilterableItem {
  status: string;
  assignees: readonly string[];
}

export function filterBoardItems<T extends FilterableItem>(items: readonly T[], filter: BoardFilter): T[] {
  return items.filter(
    (item) =>
      item.status !== DONE_STATUS &&
      (filter.scope === "all" || isAssignedTo(item.assignees, filter.displayName)) &&
      (filter.statuses === null || filter.statuses.has(item.status)),
  );
}

/** 絞り込みの選択肢。完了を除き、シートに出てくる順で数える。 */
export function countStatuses(items: readonly FilterableItem[]): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { status } of items) {
    if (status === DONE_STATUS) continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts].map(([status, count]) => ({ status, count }));
}

// ---- 時刻の表示 --------------------------------------------------------------

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の「9/28 17:15」。端末のタイムゾーンによらず同じ表示にする。 */
export function formatSyncTime(ms: number): string {
  const jst = new Date(ms + JST_OFFSET_MS);
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${minutes}`;
}

export function formatElapsed(since: number, now: number): string {
  const totalMinutes = Math.max(0, Math.floor((now - since) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分前`;
  return minutes === 0 ? `${hours}時間前` : `${hours}時間${minutes}分前`;
}
