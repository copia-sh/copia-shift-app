/** RFC 7235 のスキーム名は大文字小文字を区別しない。 */
const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * `AGENT_API_TOKEN` に求める最小文字数。
 *
 * このエンドポイントには総当たりへのレート制限が無く(Cloudflare側のWAFで設定する)、
 * 防御はトークンのエントロピーだけに依っている。`openssl rand -base64 32` は44文字になるため、
 * 32文字を下回るトークンは設定ミスとみなす。
 */
export const MIN_AGENT_TOKEN_LENGTH = 32;

/** 設定されたシークレットが、総当たりに耐える長さかどうか。 */
export function isTokenStrongEnough(token: string): boolean {
  return token.length >= MIN_AGENT_TOKEN_LENGTH;
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/** 同じ長さのバイト列を、早期終了せずに全バイト比較する。 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false; // SHA-256 同士なので常に32バイト
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * `Authorization: Bearer <token>` が、Workerに設定された共有シークレットと一致するか。
 *
 * 生の文字列を比較すると、長さが違う時点で早期returnする分だけ応答が速くなり、
 * シークレットのバイト長が応答時間から漏れる。両方をSHA-256で固定長(32バイト)に畳んでから
 * 比較することで、提示された値の長さに関わらず比較の手数を一定にする。
 *
 * シークレットが未設定(空)のときは必ず false にする。設定漏れのWorkerが
 * 誰でも通してしまう状態になるのを防ぐため。
 */
export async function isAuthorizedAgentRequest(
  authorization: string | null,
  expectedToken: string,
): Promise<boolean> {
  if (!expectedToken || !authorization) return false;
  const match = BEARER_PREFIX.exec(authorization);
  if (!match) return false;
  const presented = authorization.slice(match[0].length).trim();
  if (!presented) return false;

  const [presentedDigest, expectedDigest] = await Promise.all([
    sha256(presented),
    sha256(expectedToken),
  ]);
  return constantTimeEqual(presentedDigest, expectedDigest);
}
