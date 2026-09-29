import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { isValidPathSegment } from "./pathSegment";

/** Firebase Authentication の ID トークンを署名した公開鍵（Google が公開している JWKS）。 */
const FIREBASE_JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);

let firebaseJwks: JWTVerifyGetKey | null = null;

function defaultKeys(): JWTVerifyGetKey {
  // Worker のインスタンスが生きている間は鍵を使い回す（jose がキャッシュと更新を行う）
  firebaseJwks ??= createRemoteJWKSet(FIREBASE_JWKS_URL);
  return firebaseJwks;
}

/**
 * アプリから送られた ID トークンを検証し、ログイン中ユーザーの uid を返す。
 * 署名・発行者・対象プロジェクト・期限のどれかが合わなければ null。
 * uid は Firestore のパスに埋め込むので、安全な文字だけに限る。
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  getKey: JWTVerifyGetKey = defaultKeys(),
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });
    const uid = payload.sub;
    return typeof uid === "string" && isValidPathSegment(uid) ? uid : null;
  } catch {
    return null;
  }
}
