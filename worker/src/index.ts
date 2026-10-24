import { parseServiceAccountKey, fetchAccessToken, SPREADSHEETS_SCOPE } from "./googleAuth";
import { createFirestoreClient, type FirestoreWriteClient } from "./firestoreRest";
import { toJstDateKey } from "./jstDate";
import { isAuthorizedAgentRequest, isTokenStrongEnough, MIN_AGENT_TOKEN_LENGTH } from "./agentAuth";
import { buildAgentShifts, isValidAgentName, isValidDateKey } from "./agentShifts";
import { handleMcpRequest } from "./mcp";
import { syncShiftSheet } from "./shiftSync";
import { syncTaskBoard } from "./taskSync";
import { syncStudyRooms } from "./studyRoomSync";
import { handleTaskUpdate, TASK_UPDATE_PATH } from "./taskUpdateRoute";
import { verifyFirebaseIdToken } from "./firebaseIdToken";

/**
 * 月間表（30日分）も書く分。毎時0分と30分の実行だけ。
 *
 * Cron式の文字列一致では判定しない。Cloudflareが返す `controller.cron` の表記に
 * 依存するうえ、5分ごとと30分ごとのCronを両方登録すると、0分・30分に二重で発火する。
 * 実行時刻で決めれば、Cronは1本で済み、表記にも左右されない。
 */
export function shouldIncludeMatrix(now: Date): boolean {
  const minutes = now.getUTCMinutes();
  return minutes === 0 || minutes === 30;
}

/**
 * タスク表の取り込みは15分に1回（0・15・30・45分）。月間表と同じく実行時刻で決め、Cronは1本のまま。
 * タスクは1日に何度も変わるものではないので、5分ごとに読む必要はない。
 */
export function shouldSyncTasks(now: Date): boolean {
  return now.getUTCMinutes() % 15 === 0;
}

export interface Env {
  SHIFT_SYNC_TRIGGER_TOKEN?: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  /**
   * ローカル開発専用(`wrangler dev` + `worker/.dev.vars`)。設定すると、本物のサービスアカウント
   * 鍵やGoogle OAuthを一切使わず、ローカルのFirestoreエミュレータを"owner"権限で読みに行く。
   * 本番のデプロイではこの変数は設定しない。
   */
  FIRESTORE_EMULATOR_HOST?: string;
  /**
   * 運用エージェント向けAPIが参照するグループ。1グループに固定し、APIでは受け付けない
   * (シークレットが漏れた場合の影響範囲を、このグループだけに閉じるため)。
   */
  AGENT_GROUP_ID?: string;
  /**
   * 運用エージェント向けAPIの共有シークレット。`wrangler secret put` で登録する。
   * 未設定のときはAPI自体を無効(404)にする。
   */
  AGENT_API_TOKEN?: string;
  /**
   * ChatGPT Workspace Agent 用 MCP の共有シークレット。AGENT_API_TOKEN とは分離する。
   * 未設定のときは MCP の経路自体を無効(404)にする。
   */
  MCP_API_TOKEN?: string;
  /** Google Sheets へ同期する更新履歴スプレッドシート。 */
  SHIFT_SYNC_SPREADSHEET_ID?: string;
  /** 月間表だけを置く単体スプレッドシート。未設定なら作らない */
  SHIFT_MATRIX_SPREADSHEET_ID?: string;
  /** `"true"` のときだけ毎時のスプレッドシート同期を有効にする。 */
  SHIFT_SYNC_ENABLED?: string;
  /**
   * タスク表（アプリのタスク画面の正本）のスプレッドシート。サービスアカウントに閲覧共有する。
   * シフト同期先と同じ理由で vars に置かず secret にする。
   */
  TASK_BOARD_SPREADSHEET_ID?: string;
  /** `"true"` のときだけタスク表を Firestore へ取り込む。 */
  TASK_SYNC_ENABLED?: string;
  /** `"true"` のときだけ、アプリからのタスク進捗の更新（`POST /tasks/update`）を受け付ける。 */
  TASK_EDIT_ENABLED?: string;
  /** アプリを配信しているオリジン。タスク更新の CORS で、これ以外からの呼び出しを断る。 */
  TASK_API_ALLOWED_ORIGIN?: string;
  STUDY_ROOM_SYNC_ENABLED?: string;
  STUDY_ROOM_CALENDAR_SPREADSHEET_ID?: string;
  STUDY_ROOM_SURVEY_SPREADSHEET_ID?: string;
  STUDY_ROOM_SURVEY_SHEET_TITLE?: string;
}

const AGENT_SHIFTS_PATH = "/agent/shifts";
const MCP_PATH = "/mcp";

function notFound(): Response {
  return new Response("not found", { status: 404 });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // 勤務予定は当日中に変わりうる。古い終了時刻で再通知しないよう毎回読み直す。
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function jsonError(status: number, error: string, headers?: Record<string, string>): Response {
  return jsonResponse(status, { error }, headers);
}

/**
 * Firestoreへの接続を用意する。エミュレータ指定時は "owner" トークンで直接繋ぎ、
 * 本番ではサービスアカウント鍵からアクセストークンを取得する。
 */
async function connectFirestore(env: Env): Promise<FirestoreWriteClient> {
  const emulatorHost = env.FIRESTORE_EMULATOR_HOST;
  const accessToken = emulatorHost
    ? "owner" // Firestoreエミュレータ規約: このトークンはセキュリティルールを無視した管理者アクセスになる
    : await fetchAccessToken(parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY));
  return createFirestoreClient({
    projectId: env.FIREBASE_PROJECT_ID,
    accessToken,
    emulatorHost,
  });
}

/**
 * Cloudflare Cron からスプレッドシートを更新する。通常のHTTP経路からは起動できない。
 *
 * `includeMatrix` は30日分を読むため、毎回は実行しない（Firestoreの無料枠を超える）。
 */
async function handleScheduledSync(env: Env, includeMatrix = false): Promise<void> {
  if (env.SHIFT_SYNC_ENABLED !== "true") return;
  const groupId = env.AGENT_GROUP_ID;
  const spreadsheetId = env.SHIFT_SYNC_SPREADSHEET_ID;
  if (!groupId || !spreadsheetId) {
    console.error("copia-shift-ics-feed: shift sync is enabled but not configured");
    return;
  }
  try {
    const account = parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const [firestore, sheetsToken] = await Promise.all([
      connectFirestore(env),
      fetchAccessToken(account, { scopes: [SPREADSHEETS_SCOPE] }),
    ]);
    const result = await syncShiftSheet({
      firestore,
      groupId,
      spreadsheetId,
      accessToken: sheetsToken,
      includeMatrix,
      matrixSpreadsheetId: env.SHIFT_MATRIX_SPREADSHEET_ID,
    });
    console.info(
      `copia-shift-ics-feed: shift sync completed (${result.rowCount} rows, ${result.matrixRowCount} members)`,
    );
  } catch (error) {
    console.error("copia-shift-ics-feed: shift sync failed", error);
    // 握りつぶすと Cloudflare の Cron 実行履歴が常に成功と表示され、
    // 同期が何日も止まっていても気づけない。実行を失敗として残す。
    throw error;
  }
}

/** タスク表を読んで `taskBoard/current` を書き直す。アプリのタスク画面はこれを閲覧する。 */
async function handleScheduledTaskSync(env: Env): Promise<void> {
  if (env.TASK_SYNC_ENABLED !== "true") return;
  const groupId = env.AGENT_GROUP_ID;
  const spreadsheetId = env.TASK_BOARD_SPREADSHEET_ID;
  if (!groupId || !spreadsheetId) {
    console.error("copia-shift-ics-feed: task sync is enabled but not configured");
    return;
  }
  try {
    const account = parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const [firestore, sheetsToken] = await Promise.all([
      connectFirestore(env),
      fetchAccessToken(account, { scopes: [SPREADSHEETS_SCOPE] }),
    ]);
    const result = await syncTaskBoard({ firestore, groupId, spreadsheetId, accessToken: sheetsToken });
    console.info(
      `copia-shift-ics-feed: task sync completed (${result.taskCount} tasks, ${result.routineCount} routines)`,
    );
  } catch (error) {
    console.error("copia-shift-ics-feed: task sync failed", error);
    throw error;
  }
}

/**
 * シフト同期とタスク同期を互いに巻き込まず実行し、どちらかが失敗していれば Cron を失敗させる。
 * 片方の障害でもう片方まで止まると、原因と関係ない画面の情報まで古くなるため。
 */
async function runScheduledJobs(jobs: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(jobs);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}

async function handleScheduledStudyRoomSync(env: Env): Promise<void> {
  if (env.STUDY_ROOM_SYNC_ENABLED !== "true") return;
  if (!env.AGENT_GROUP_ID || !env.STUDY_ROOM_CALENDAR_SPREADSHEET_ID) throw new Error("study room sync is not configured");
  const [firestore, accessToken] = await Promise.all([
    connectFirestore(env),
    fetchAccessToken(parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY), { scopes: [SPREADSHEETS_SCOPE] }),
  ]);
  await syncStudyRooms({ firestore, accessToken, groupId: env.AGENT_GROUP_ID,
    spreadsheetId: env.STUDY_ROOM_CALENDAR_SPREADSHEET_ID,
    surveySpreadsheetId: env.STUDY_ROOM_SURVEY_SPREADSHEET_ID,
    surveySheetTitle: env.STUDY_ROOM_SURVEY_SHEET_TITLE });
}

/** `GET /agent/shifts?date=YYYY-MM-DD&name=氏名` — 運用エージェント向けの読み取り専用API。 */
async function handleAgentShifts(request: Request, url: URL, env: Env): Promise<Response> {
  const groupId = env.AGENT_GROUP_ID;
  const expectedToken = env.AGENT_API_TOKEN;
  // 任意機能。未設定なら、そもそもこのパスが存在しないものとして扱う。
  if (!groupId || !expectedToken) return notFound();

  // 短いシークレットは総当たりされうる。黙って通さず、無効のまま理由をログに残す。
  if (!isTokenStrongEnough(expectedToken)) {
    console.error(
      `copia-shift-ics-feed: AGENT_API_TOKEN が短すぎます(${MIN_AGENT_TOKEN_LENGTH}文字以上必要)。` +
        "/agent/shifts は無効のままにします。",
    );
    return notFound();
  }

  if (!(await isAuthorizedAgentRequest(request.headers.get("Authorization"), expectedToken))) {
    return jsonError(401, "unauthorized", { "WWW-Authenticate": "Bearer" });
  }

  const name = url.searchParams.get("name");
  if (!name) return jsonError(400, "missing_name");
  // 長さだけは、正規化処理へ渡す前にここで切る。
  if (!isValidAgentName(name)) return jsonError(400, "invalid_name");

  // 省略時は「本日」。WorkerはUTCで動くので、必ずJSTの暦日に直してから使う。
  const date = url.searchParams.get("date") ?? toJstDateKey(new Date());
  // 日付が壊れているだけなら、OAuthトークン取得もFirestore接続もせずに返す。
  if (!isValidDateKey(date)) return jsonError(400, "invalid_date");

  try {
    const firestore = await connectFirestore(env);
    const result = await buildAgentShifts({ firestore, groupId, date, name });
    if (!result.ok) return jsonError(result.status, result.reason);
    return jsonResponse(200, result.payload);
  } catch (error) {
    console.error("copia-shift-ics-feed: failed to build agent shifts", error);
    return jsonError(500, "internal_error");
  }
}

/** `POST /mcp` — ChatGPT Workspace Agent 向け、シフト参照だけを公開する MCP。 */
async function handleMcp(request: Request, env: Env): Promise<Response> {
  const groupId = env.AGENT_GROUP_ID;
  const expectedToken = env.MCP_API_TOKEN;
  if (!groupId || !expectedToken) return notFound();
  if (!isTokenStrongEnough(expectedToken)) {
    console.error(
      `copia-shift-ics-feed: MCP_API_TOKEN が短すぎます(${MIN_AGENT_TOKEN_LENGTH}文字以上必要)。` +
        "/mcp は無効のままにします。",
    );
    return notFound();
  }
  // Streamable HTTP の要件: ブラウザ由来の別 Origin を受け付けない。
  // ChatGPT のサーバー間接続は Origin を送らないため、無い場合だけ通す。
  if (request.headers.get("Origin")) return new Response("forbidden", { status: 403 });
  if (!(await isAuthorizedAgentRequest(request.headers.get("Authorization"), expectedToken))) {
    return jsonError(401, "unauthorized", { "WWW-Authenticate": "Bearer" });
  }

  return handleMcpRequest(request, {
    async getShifts({ date, name }) {
      const firestore = await connectFirestore(env);
      return buildAgentShifts({ firestore, groupId, date, name });
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/agent/sync" && request.method === "POST") {
      const token = env.SHIFT_SYNC_TRIGGER_TOKEN;
      if (env.SHIFT_SYNC_ENABLED !== "true" || !token || !isTokenStrongEnough(token)) return notFound();
      if (!(await isAuthorizedAgentRequest(request.headers.get("Authorization"), token))) return jsonError(401, "unauthorized");
      try {
        // 手動起動は「今すぐ全部更新したい」ときに使うので、月間表とタスク表も書く。
        await runScheduledJobs([handleScheduledSync(env, true), handleScheduledTaskSync(env), handleScheduledStudyRoomSync(env)]);
        return jsonResponse(200, { ok: true });
      } catch {
        return jsonError(500, "sync_failed");
      }
    }

    if (url.pathname === MCP_PATH) return handleMcp(request, env);
    if (url.pathname === TASK_UPDATE_PATH) {
      return handleTaskUpdate(request, env, {
        verifyToken: (token) => verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID),
        connect: async () => {
          const account = parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY);
          const [firestore, sheetsToken] = await Promise.all([
            connectFirestore(env),
            fetchAccessToken(account, { scopes: [SPREADSHEETS_SCOPE] }),
          ]);
          return { firestore, sheetsToken };
        },
      });
    }
    if (request.method !== "GET") return notFound();

    if (url.pathname === AGENT_SHIFTS_PATH) {
      return handleAgentShifts(request, url, env);
    }
    return notFound();
  },
  // waitUntil ではなく await する。waitUntil だと同期の成否に関わらず実行が成功扱いになり、
  // Cron の実行履歴から失敗を読み取れない。
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // 0分・30分の実行でだけ月間表（30日分）を書く。ほかは8日分の一覧だけ。
    const now = new Date();
    await runScheduledJobs([
      handleScheduledSync(env, shouldIncludeMatrix(now)),
      ...(shouldSyncTasks(now) ? [handleScheduledTaskSync(env), handleScheduledStudyRoomSync(env)] : []),
    ]);
  },
};
