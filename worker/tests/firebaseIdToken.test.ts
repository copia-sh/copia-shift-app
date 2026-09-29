import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT, generateKeyPair, type CryptoKey } from "jose";
import { verifyFirebaseIdToken } from "../src/firebaseIdToken";

const PROJECT = "copia-shift-app";
let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
});

function token(over: { sub?: string; aud?: string; iss?: string; exp?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject(over.sub ?? "uid-1")
    .setAudience(over.aud ?? PROJECT)
    .setIssuer(over.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setIssuedAt(now - 10)
    .setExpirationTime(over.exp ?? now + 600)
    .sign(privateKey);
}

describe("verifyFirebaseIdToken", () => {
  const getKey = async () => publicKey;

  it("このプロジェクトの有効なトークンなら uid を返す", async () => {
    expect(await verifyFirebaseIdToken(await token(), PROJECT, getKey)).toBe("uid-1");
  });

  it("別プロジェクト・発行者違い・期限切れ・壊れたトークンは null", async () => {
    expect(await verifyFirebaseIdToken(await token({ aud: "other" }), PROJECT, getKey)).toBeNull();
    expect(await verifyFirebaseIdToken(await token({ iss: "https://evil.example" }), PROJECT, getKey)).toBeNull();
    expect(await verifyFirebaseIdToken(await token({ exp: Math.floor(Date.now() / 1000) - 60 }), PROJECT, getKey)).toBeNull();
    expect(await verifyFirebaseIdToken("not-a-jwt", PROJECT, getKey)).toBeNull();
  });

  it("uid がパスに使えない文字を含むなら null", async () => {
    expect(await verifyFirebaseIdToken(await token({ sub: "a/b" }), PROJECT, getKey)).toBeNull();
  });
});
