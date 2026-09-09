import { parseServiceAccountKey, fetchAccessToken, SPREADSHEETS_SCOPE } from "./googleAuth";
import { createFirestoreClient, type FirestoreClient } from "./firestoreRest";
import { buildFeed, toJstDateKey } from "./feed";
import { isValidPathSegment } from "./pathSegment";
import { isAuthorizedAgentRequest, isTokenStrongEnough, MIN_AGENT_TOKEN_LENGTH } from "./agentAuth";
import { buildAgentShifts, isValidAgentName, isValidDateKey } from "./agentShifts";
import { handleMcpRequest } from "./mcp";
import { syncShiftSheet } from "./shiftSync";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  /**
   * ローカル開発専用(`wrangler dev` + `worker/.dev.vars`)。設定すると、本物のサービスアカウント
   * 鍵やGoogle OAuthを一切使わず、ローカルのFirestoreエミュレータを"owner"権限で読みに行く。
   * 本番のデプロイではこの変数は設定しない。
   */
  FIRESTORE_EMULATOR_HOST?: string;
  /**
   * カレンダー購読フィード(`/feed/...`)を有効にするかどうか。文字列 `"true"` のときだけ有効。
   * 既定では無効で、経路そのものが404になる。使うつもりが無い機能を、サービスアカウント鍵を
   * 設定しただけで公開してしまわないようにするため(フェイルクローズ)。
   */
  ICS_FEED_ENABLED?: string;
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
  /** `"true"` のときだけ毎時のスプレッドシート同期を有効にする。 */
  SHIFT_SYNC_ENABLED?: string;
}

const FEED_PATH = /^\/feed\/([^/]+)\/([^/]+)\.ics$/;
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
async function connectFirestore(env: Env): Promise<FirestoreClient> {
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

/** Cloudflare Cron から `シフト同期` タブを更新する。通常のHTTP経路からは起動できない。 */
async function handleScheduledSync(env: Env): Promise<void> {
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
    const result = await syncShiftSheet({ firestore, groupId, spreadsheetId, accessToken: sheetsToken });
    console.info(`copia-shift-ics-feed: shift sync completed (${result.rowCount} rows)`);
  } catch (error) {
    console.error("copia-shift-ics-feed: shift sync failed", error);
    // 握りつぶすと Cloudflare の Cron 実行履歴が常に成功と表示され、
    // 同期が何日も止まっていても気づけない。実行を失敗として残す。
    throw error;
  }
}

/**
 * フィードが有効かどうか。`"true"` 以外(未設定・空・"false"・大文字・前後の空白付きを含む)は
 * すべて無効として扱う。設定ミスで意図せず公開されるより、有効化に気づかないほうが安全。
 */
function isFeedEnabled(env: Env): boolean {
  return env.ICS_FEED_ENABLED === "true";
}

/** `GET /feed/{groupId}/{token}.ics` — カレンダーアプリ向けの購読フィード。 */
async function handleFeed(env: Env, groupIdRaw: string, tokenRaw: string): Promise<Response> {
  // %2F はここで初めて `/` に戻る(ルーティングの正規表現はデコード前の文字列にしか効かない)。
  // 不正な文字が混じっていれば、Firestoreへの往復もOAuthトークン取得も行わずここで弾く。
  const groupId = decodeURIComponent(groupIdRaw);
  const token = decodeURIComponent(tokenRaw);
  if (!isValidPathSegment(groupId) || !isValidPathSegment(token)) return notFound();

  try {
    const firestore = await connectFirestore(env);
    const result = await buildFeed({ firestore, groupId, token });
    if (!result.ok) return notFound();

    return new Response(result.icalendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // カレンダーアプリの定期的なポーリングを想定した短時間キャッシュ。
        // no-store にすると更新のたびにFirestore/OAuth往復が走ってしまう。
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    // サービスアカウント鍵の設定ミス・Google側の一時的な障害・Firestoreのインデックス不足など。
    // ここで拾わないと Cloudflare の素の 1101 エラーページが出て原因が追えなくなる。
    console.error("copia-shift-ics-feed: failed to build feed", error);
    return new Response("internal error", { status: 500 });
  }
}

/** `GET /agent/shifts?date=YYYY-MM-DD&name=氏名` — 運用エージェント向けの読み取り専用API。 */
async function handleAgentShifts(request: Request, url: URL, env: Env): Promise<Response> {
  const groupId = env.AGENT_GROUP_ID;
  const expectedToken = env.AGENT_API_TOKEN;
  // フィードと同じく任意機能。未設定なら、そもそもこのパスが存在しないものとして扱う。
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

    if (url.pathname === MCP_PATH) return handleMcp(request, env);
    if (request.method !== "GET") return notFound();

    if (url.pathname === AGENT_SHIFTS_PATH) {
      return handleAgentShifts(request, url, env);
    }

    const match = FEED_PATH.exec(url.pathname);
    // 無効時はFirestoreへの往復もOAuthトークン取得も行わず、経路が無いものとして返す。
    if (!match || !isFeedEnabled(env)) return notFound();
    return handleFeed(env, match[1], match[2]);
  },
  // waitUntil ではなく await する。waitUntil だと同期の成否に関わらず実行が成功扱いになり、
  // Cron の実行履歴から失敗を読み取れない。
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleScheduledSync(env);
  },
};
