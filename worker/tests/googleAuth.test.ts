import { describe, it, expect, vi } from "vitest";
import { exportPKCS8, jwtVerify, SignJWT } from "jose";
import { parseServiceAccountKey, fetchAccessToken } from "../src/googleAuth";

describe("parseServiceAccountKey", () => {
  it("throws on invalid JSON", () => {
    expect(() => parseServiceAccountKey("not json")).toThrow();
  });

  it("throws when client_email is missing", () => {
    expect(() => parseServiceAccountKey(JSON.stringify({ private_key: "x" }))).toThrow();
  });

  it("throws when private_key is missing", () => {
    expect(() => parseServiceAccountKey(JSON.stringify({ client_email: "a@b.iam.gserviceaccount.com" }))).toThrow();
  });

  it("extracts client_email and private_key, ignoring extra fields", () => {
    const result = parseServiceAccountKey(
      JSON.stringify({
        client_email: "bot@project.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
        project_id: "project",
      }),
    );
    expect(result).toEqual({
      client_email: "bot@project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });
  });
});

async function generateTestKeyPair() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  return { privateKey, publicKey, privateKeyPem: await exportPKCS8(privateKey) };
}

describe("fetchAccessToken", () => {
  it("signs a real RS256 JWT bearer assertion and exchanges it for an access token", async () => {
    const { publicKey, privateKeyPem } = await generateTestKeyPair();
    const clientEmail = "bot@project.iam.gserviceaccount.com";
    const now = new Date("2026-06-15T00:00:00.000Z");

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "fake-access-token" }), { status: 200 }),
    );

    const token = await fetchAccessToken(
      { client_email: clientEmail, private_key: privateKeyPem },
      { now, fetchImpl },
    );

    expect(token).toBe("fake-access-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");

    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = body.get("assertion") as string;
    expect(assertion.split(".")).toHaveLength(3);

    // アサーション自体が、対応する公開鍵で検証できる正しいRS256署名であることを確認する
    const { payload } = await jwtVerify(assertion, publicKey, {
      issuer: clientEmail,
      audience: "https://oauth2.googleapis.com/token",
      currentDate: now,
    });
    expect(payload.scope).toBe("https://www.googleapis.com/auth/datastore");
    expect(payload.exp! - payload.iat!).toBe(3600);
  });

  it("uses only the explicitly requested scope", async () => {
    const { publicKey, privateKeyPem } = await generateTestKeyPair();
    const now = new Date("2026-06-15T00:00:00.000Z");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }));
    await fetchAccessToken(
      { client_email: "bot@project.iam.gserviceaccount.com", private_key: privateKeyPem },
      { now, fetchImpl, scopes: ["https://www.googleapis.com/auth/spreadsheets"] },
    );
    const assertion = new URLSearchParams(fetchImpl.mock.calls[0][1].body as string).get("assertion") as string;
    const { payload } = await jwtVerify(assertion, publicKey, { currentDate: now });
    expect(payload.scope).toBe("https://www.googleapis.com/auth/spreadsheets");
  });

  it("throws when the token endpoint responds with a non-ok status", async () => {
    const { privateKeyPem } = await generateTestKeyPair();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      fetchAccessToken(
        { client_email: "bot@project.iam.gserviceaccount.com", private_key: privateKeyPem },
        { fetchImpl },
      ),
    ).rejects.toThrow();
  });

  it("rejects a JWT signed by a different key when verified against the real public key", async () => {
    const { publicKey } = await generateTestKeyPair();
    const other = await generateTestKeyPair();
    const forged = await new SignJWT({ scope: "x" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("attacker")
      .sign(other.privateKey);
    await expect(jwtVerify(forged, publicKey)).rejects.toThrow();
  });
});
