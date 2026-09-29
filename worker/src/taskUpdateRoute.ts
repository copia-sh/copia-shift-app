import type { FirestoreWriteClient } from "./firestoreRest";
import { toJstDateKey } from "./feed";
import { buildRowUpdates, parseTaskUpdate, type CellWrite } from "./taskUpdate";
import { ROUTINE_SHEET_TITLE, syncTaskBoard, TASK_SHEET_TITLE } from "./taskSync";

export const TASK_UPDATE_PATH = "/tasks/update";

export interface TaskUpdateEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  AGENT_GROUP_ID?: string;
  TASK_BOARD_SPREADSHEET_ID?: string;
  /** `"true"` のときだけ、アプリからのタスク更新を受け付ける */
  TASK_EDIT_ENABLED?: string;
  /** アプリを配信しているオリジン（例: https://copia-sh.github.io）。これ以外からの呼び出しは断る */
  TASK_API_ALLOWED_ORIGIN?: string;
}

export interface TaskUpdateDeps {
  verifyToken: (token: string) => Promise<string | null>;
  connect: () => Promise<{
    firestore: Pick<FirestoreWriteClient, "getDocument" | "setDocument">;
    sheetsToken: string;
  }>;
  now?: () => Date;
}

const sheetsBase = (id: string) => `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

async function readTab(spreadsheetId: string, token: string, title: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${title}'!A:Z`);
  const res = await fetch(`${sheetsBase(spreadsheetId)}/values/${range}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Sheets read failed: ${res.status}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

async function writeCells(spreadsheetId: string, token: string, title: string, cells: CellWrite[]): Promise<void> {
  const res = await fetch(`${sheetsBase(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // RAW: 入力を数式や日付として解釈させない
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: cells.map((c) => ({ range: `'${title}'!${c.range}`, values: [[c.value]] })),
    }),
  });
  if (!res.ok) throw new Error(`Google Sheets write failed: ${res.status}`);
}

/**
 * `POST /tasks/update` — アプリのタスク画面から、進捗をタスク表へ即時に書き込む。
 * 承認は挟まず、アプリ側（Firestore）には申請を残さない。書いたあとすぐ取り込み直して画面へ反映する。
 * 呼べるのは、許可したオリジンから、ログイン中でグループに在籍しているメンバーだけ。
 */
export async function handleTaskUpdate(request: Request, env: TaskUpdateEnv, deps: TaskUpdateDeps): Promise<Response> {
  const groupId = env.AGENT_GROUP_ID;
  const spreadsheetId = env.TASK_BOARD_SPREADSHEET_ID;
  const allowedOrigin = env.TASK_API_ALLOWED_ORIGIN;
  if (env.TASK_EDIT_ENABLED !== "true" || !groupId || !spreadsheetId || !allowedOrigin) {
    return new Response("not found", { status: 404 });
  }
  if (request.headers.get("Origin") !== allowedOrigin) return json(403, { error: "forbidden_origin" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, allowedOrigin);

  const token = /^Bearer (.+)$/u.exec(request.headers.get("Authorization") ?? "")?.[1];
  const uid = token ? await deps.verifyToken(token) : null;
  if (!uid) return json(401, { error: "unauthorized" }, allowedOrigin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" }, allowedOrigin);
  }
  const parsed = parseTaskUpdate(body);
  if (!parsed.ok) return json(400, { error: parsed.error }, allowedOrigin);

  try {
    const { firestore, sheetsToken } = await deps.connect();
    const member = await firestore.getDocument(`groups/${groupId}/members/${uid}`);
    const displayName = member?.data.displayName;
    if (member?.data.active !== true || typeof displayName !== "string") {
      return json(403, { error: "not_member" }, allowedOrigin);
    }

    const now = deps.now?.() ?? new Date();
    const title = parsed.value.kind === "task" ? TASK_SHEET_TITLE : ROUTINE_SHEET_TITLE;
    const rows = await readTab(spreadsheetId, sheetsToken, title);
    const plan = buildRowUpdates(rows, parsed.value, displayName, toJstDateKey(now));
    if (!plan.ok) return json(409, { error: plan.error }, allowedOrigin);

    await writeCells(spreadsheetId, sheetsToken, title, plan.cells);
    await syncTaskBoard({ firestore, groupId, spreadsheetId, accessToken: sheetsToken, now });
    return json(200, { ok: true }, allowedOrigin);
  } catch (error) {
    console.error("copia-shift-ics-feed: task update failed", error);
    return json(500, { error: "update_failed" }, allowedOrigin);
  }
}
