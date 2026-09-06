import { SignJWT, importPKCS8 } from "jose";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const ACCESS_TOKEN_TTL_SECONDS = 3600;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** Firebase コンソールで発行したサービスアカウント鍵(JSON文字列)から必要な項目だけ取り出す。 */
export function parseServiceAccountKey(json: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }
  const record = parsed as Record<string, unknown>;
  const clientEmail = record.client_email;
  const privateKey = record.private_key;
  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is missing client_email or private_key");
  }
  return { client_email: clientEmail, private_key: privateKey };
}

export interface FetchAccessTokenOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
}

/**
 * サービスアカウントの秘密鍵でJWTに署名し(OAuth2 JWTベアラーフロー)、
 * Firestore REST API 用のアクセストークンと交換する。署名自体は jose (WebCrypto ベース) に任せ、
 * 自前でRSA署名は実装しない。
 */
export async function fetchAccessToken(
  account: ServiceAccount,
  { now = new Date(), fetchImpl = fetch }: FetchAccessTokenOptions = {},
): Promise<string> {
  const key = await importPKCS8(account.private_key, "RS256");
  const iat = Math.floor(now.getTime() / 1000);

  const assertion = await new SignJWT({ scope: FIRESTORE_SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);

  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`failed to obtain a Google access token: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
