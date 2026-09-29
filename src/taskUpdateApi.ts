import { TASK_STATUSES } from "./taskBoard";

/**
 * タスク画面から進捗をタスク表へ書き込むときの、送信内容と失敗時の文言。
 * 送信そのもの（ログイン中ユーザーのトークンを付けた fetch）は firebase/taskUpdate.ts にある。
 */

export interface TaskUpdateTarget {
  kind: "task" | "routine";
  no: string;
  title: string;
  status: string;
}

export interface TaskUpdateForm {
  status: string;
  memo: string;
  deliverable: string;
}

export interface TaskUpdatePayload {
  kind: "task" | "routine";
  no: string;
  title: string;
  status?: string;
  memo?: string;
  deliverable?: string;
}

/** 変えた項目だけを送る。何も変えていなければ null（送信ボタンを押せないようにする）。 */
export function buildTaskUpdatePayload(target: TaskUpdateTarget, form: TaskUpdateForm): TaskUpdatePayload | null {
  const status = form.status !== target.status ? form.status : "";
  const memo = form.memo.trim();
  const deliverable = form.deliverable.trim();
  if (!status && !memo && !deliverable) return null;
  return {
    kind: target.kind,
    no: target.kind === "task" ? target.no : "",
    title: target.title,
    ...(status && { status }),
    ...(memo && { memo }),
    ...(deliverable && { deliverable }),
  };
}

export type TaskUpdateResult = { ok: true } | { ok: false; code: string };
export type SubmitTaskUpdate = (payload: TaskUpdatePayload) => Promise<TaskUpdateResult>;

const MESSAGES: Record<string, string> = {
  row_not_found: "シート上でこのタスクが見つかりませんでした。シートが更新された可能性があります。画面が新しくなってから、もう一度お試しください。",
  ambiguous_row: "シートに同じタスクが複数あるため、どの行か決められませんでした。シートで直接更新してください。",
  column_missing: "シートの列の構成が変わっているため反映できませんでした。シートで直接更新してください。",
  invalid_status: "選べないステータスです。",
  memo_too_long: "状況メモは1000文字以内にしてください。",
  deliverable_too_long: "成果物は500文字以内にしてください。",
  unauthorized: "ログインの有効期限が切れました。ページを再読み込みしてください。",
  not_member: "このグループのメンバーではないため更新できません。",
  not_configured: "この環境ではアプリからの更新が有効になっていません。シートで直接更新してください。",
  network: "通信に失敗しました。電波の良いところでもう一度お試しください。",
};

export function taskUpdateErrorMessage(code: string): string {
  return MESSAGES[code] ?? "反映できませんでした。時間をおいてもう一度お試しください。";
}

export interface UpdateNotice {
  message: string;
  /** 「元に戻す」で送る内容。ステータスを変えたときだけ（メモの追記は取り消せない） */
  undo: TaskUpdatePayload | null;
}

/** 反映後に画面下へ出す知らせ。完了にすると一覧から消えるので、何をしたかをここで伝える。 */
export function describeUpdate(payload: TaskUpdatePayload, previousStatus: string): UpdateNotice {
  // 「No.4 を」は空白を挟み、「「報告会」を」は括弧の後に続ける
  const name = payload.kind === "task" && payload.no ? `No.${payload.no} ` : `「${payload.title}」`;
  if (!payload.status) return { message: `${name}を更新しました`, undo: null };
  const canUndo = (TASK_STATUSES as readonly string[]).includes(previousStatus) && previousStatus !== payload.status;
  return {
    message: `${name}を「${payload.status}」にしました`,
    undo: canUndo ? { kind: payload.kind, no: payload.no, title: payload.title, status: previousStatus } : null,
  };
}
