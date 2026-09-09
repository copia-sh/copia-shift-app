import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker, { type Env } from "../src/index";

async function generateServiceAccountJson(): Promise<string> {
  const { exportPKCS8 } = await import("jose");
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  return JSON.stringify({
    client_email: "bot@project.iam.gserviceaccount.com",
    private_key: await exportPKCS8(privateKey),
  });
}

function firestoreDocJson(path: string, fields: Record<string, unknown>) {
  const encode = (v: unknown): unknown => {
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
    throw new Error("unsupported test value");
  };
  const encoded: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) encoded[k] = encode(v);
  return { name: `projects/p1/databases/(default)/documents/${path}`, fields: encoded };
}

describe("worker fetch handler", () => {
  let env: Env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    env = {
      FIREBASE_PROJECT_ID: "p1",
      FIREBASE_SERVICE_ACCOUNT_KEY: await generateServiceAccountJson(),
      // フィードは既定で無効。既存の挙動を確認するテストでは明示的に有効化する。
      ICS_FEED_ENABLED: "true",
    };

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
      }
      if (url.endsWith("/groups/g1/shareLinks/tok-abc")) {
        return new Response(
          JSON.stringify(
            firestoreDocJson("groups/g1/shareLinks/tok-abc", {
              memberId: "u1",
              statuses: ["confirmed"],
              typeKeys: ["出勤"],
            }),
          ),
          { status: 200 },
        );
      }
      if (url.endsWith("/groups/g1/shareLinks/missing")) {
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("/groups/g1/members/u1")) {
        return new Response(JSON.stringify(firestoreDocJson("groups/g1/members/u1", { active: true })), {
          status: 200,
        });
      }
      if (url.endsWith(":runQuery")) {
        return new Response(
          JSON.stringify([
            {
              document: firestoreDocJson("groups/g1/shifts/s1", {
                memberId: "u1",
                date: new Date().toISOString().slice(0, 10),
                status: "confirmed",
                type: "出勤",
              }),
            },
          ]),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url} ${JSON.stringify(init)}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a 404 for unrelated paths", async () => {
    const res = await worker.fetch(new Request("https://worker.example.dev/other"), env);
    expect(res.status).toBe(404);
  });

  it("returns a 404 for a non-GET method on the feed route", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example.dev/feed/g1/tok-abc.ics", { method: "POST" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns a 404 when the token is unknown", async () => {
    const res = await worker.fetch(new Request("https://worker.example.dev/feed/g1/missing.ics"), env);
    expect(res.status).toBe(404);
  });

  it("returns a 404 for a path-traversal token (encoded slash + dot-segments) without calling fetch at all", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example.dev/feed/g1/x%2F..%2F..%2Fmembers%2FM1.ics"),
      env,
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a 500 (not an unhandled exception) when Firestore errors unexpectedly", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "fake-token" }), { status: 200 });
      }
      return new Response(null, { status: 500 });
    });
    const res = await worker.fetch(new Request("https://worker.example.dev/feed/g1/tok-abc.ics"), env);
    expect(res.status).toBe(500);
  });

  it("talks to the local emulator with an owner token and never calls Google OAuth when FIRESTORE_EMULATOR_HOST is set", async () => {
    const emulatorFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://oauth2.googleapis.com/token") {
        throw new Error("must not call Google OAuth when using the emulator");
      }
      if (url.endsWith("/groups/g1/shareLinks/tok-abc")) {
        return new Response(
          JSON.stringify(
            firestoreDocJson("groups/g1/shareLinks/tok-abc", {
              memberId: "u1",
              statuses: ["confirmed"],
              typeKeys: ["出勤"],
            }),
          ),
          { status: 200 },
        );
      }
      if (url.endsWith("/groups/g1/members/u1")) {
        return new Response(JSON.stringify(firestoreDocJson("groups/g1/members/u1", { active: true })), {
          status: 200,
        });
      }
      if (url.endsWith(":runQuery")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", emulatorFetch);

    const emulatorEnv: Env = { ...env, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
    const res = await worker.fetch(new Request("https://worker.example.dev/feed/g1/tok-abc.ics"), emulatorEnv);

    expect(res.status).toBe(200);
    const [url] = emulatorFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8080/v1/projects/p1/databases/(default)/documents/groups/g1/shareLinks/tok-abc");
  });

  it("returns a 404 for the feed route when ICS_FEED_ENABLED is unset, without calling fetch at all", async () => {
    const res = await worker.fetch(new Request("https://worker.example.dev/feed/g1/tok-abc.ics"), {
      ...env,
      ICS_FEED_ENABLED: undefined,
    });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the feed route disabled for any value other than \"true\" (fail closed)", async () => {
    for (const value of ["false", "1", "yes", "TRUE ", ""]) {
      const res = await worker.fetch(
        new Request("https://worker.example.dev/feed/g1/tok-abc.ics"),
        { ...env, ICS_FEED_ENABLED: value },
      );
      expect(res.status, `ICS_FEED_ENABLED=${JSON.stringify(value)}`).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a text/calendar feed with the correct content and cache headers", async () => {
    const res = await worker.fetch(new Request("https://worker.example.dev/feed/g1/tok-abc.ics"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("s1@copia-shift");
  });
});
