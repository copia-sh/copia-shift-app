import { parseServiceAccountKey, fetchAccessToken } from "./googleAuth";
import { createFirestoreClient } from "./firestoreRest";
import { buildFeed } from "./feed";
import { isValidPathSegment } from "./pathSegment";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  /**
   * ローカル開発専用(`wrangler dev` + `worker/.dev.vars`)。設定すると、本物のサービスアカウント
   * 鍵やGoogle OAuthを一切使わず、ローカルのFirestoreエミュレータを"owner"権限で読みに行く。
   * 本番のデプロイではこの変数は設定しない。
   */
  FIRESTORE_EMULATOR_HOST?: string;
}

const FEED_PATH = /^\/feed\/([^/]+)\/([^/]+)\.ics$/;

function notFound(): Response {
  return new Response("not found", { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = FEED_PATH.exec(url.pathname);
    if (request.method !== "GET" || !match) return notFound();

    // %2F はここで初めて `/` に戻る(ルーティングの正規表現はデコード前の文字列にしか効かない)。
    // 不正な文字が混じっていれば、Firestoreへの往復もOAuthトークン取得も行わずここで弾く。
    const groupId = decodeURIComponent(match[1]);
    const token = decodeURIComponent(match[2]);
    if (!isValidPathSegment(groupId) || !isValidPathSegment(token)) return notFound();

    try {
      const emulatorHost = env.FIRESTORE_EMULATOR_HOST;
      const accessToken = emulatorHost
        ? "owner" // Firestoreエミュレータ規約: このトークンはセキュリティルールを無視した管理者アクセスになる
        : await fetchAccessToken(parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY));
      const firestore = createFirestoreClient({
        projectId: env.FIREBASE_PROJECT_ID,
        accessToken,
        emulatorHost,
      });

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
  },
};
