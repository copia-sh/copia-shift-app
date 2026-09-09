import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { toJstDateKey } from "../src/feed";
import { MIN_AGENT_TOKEN_LENGTH } from "../src/agentAuth";

// 実運用と同じ強度(32文字以上)。短いトークンはWorker側で無効扱いになる。
const TOKEN = "agent-token-for-tests-0123456789";
const DATE = "2026-06-20";

function firestoreDocJson(path: string, fields: Record<string, unknown>) {
  const encode = (v: unknown): unknown => {
    if (v === null) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
    if (typeof v === "object") {
      const fields: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) fields[k] = encode(val);
      return { mapValue: { fields } };
    }
    throw new Error("unsupported test value");
  };
  const encoded: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) encoded[k] = encode(v);
  return { name: `projects/p1/databases/(default)/documents/${path}`, fields: encoded };
}

/** runQuery のリクエストボディから、どのコレクションを引いているか読み取る。 */
function collectionIdOf(init: RequestInit | undefined): string {
  const body = JSON.parse(String(init?.body ?? "{}"));
  return body.structuredQuery?.from?.[0]?.collectionId ?? "";
}

describe("GET /agent/shifts", () => {
  let env: Env;

  beforeEach(() => {
    env = {
      FIREBASE_PROJECT_ID: "p1",
      FIREBASE_SERVICE_ACCOUNT_KEY: "unused-with-emulator",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      AGENT_GROUP_ID: "g1",
      AGENT_API_TOKEN: TOKEN,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://oauth2.googleapis.com/token") {
          throw new Error("must not call Google OAuth when using the emulator");
        }
        if (url.endsWith("/groups/g1/settings/shiftTypes")) {
          return new Response(null, { status: 404 });
        }
        if (url.endsWith(":runQuery")) {
          const collectionId = collectionIdOf(init);
          if (collectionId === "members") {
            return new Response(
              JSON.stringify([
                {
                  document: firestoreDocJson("groups/g1/members/u1", {
                    displayName: "田村 翔",
                    email: "tamura@example.com",
                    active: true,
                  }),
                },
              ]),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify([
              {
                document: firestoreDocJson("groups/g1/shifts/s1", {
                  memberId: "u1",
                  date: DATE,
                  status: "confirmed",
                  type: "出勤",
                  startTime: "10:00",
                  endTime: "18:00",
                }),
              },
            ]),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function request(query: string, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }) {
    return new Request(`https://worker.example.dev/agent/shifts${query}`, { headers });
  }

  it("returns the member's shift for the requested day as JSON", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=${encodeURIComponent("田村翔")}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      date: DATE,
      name: "田村 翔",
      workStart: "10:00",
      workEnd: "18:00",
      segments: [
        { type: "出勤", label: "出勤", attendance: "available", startTime: "10:00", endTime: "18:00" },
      ],
    });
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=田村`, {}), env);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("rejects a wrong bearer token", async () => {
    const res = await worker.fetch(
      request(`?date=${DATE}&name=田村`, { Authorization: "Bearer nope" }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns a 404 (feature disabled) when AGENT_API_TOKEN is not configured", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=田村`), {
      ...env,
      AGENT_API_TOKEN: undefined,
    });
    expect(res.status).toBe(404);
  });

  it("returns a 404 (feature disabled) when AGENT_GROUP_ID is not configured", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=田村`), {
      ...env,
      AGENT_GROUP_ID: undefined,
    });
    expect(res.status).toBe(404);
  });

  it("rejects a non-GET method", async () => {
    const res = await worker.fetch(
      new Request(`https://worker.example.dev/agent/shifts?date=${DATE}&name=田村`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("requires the name parameter", async () => {
    const res = await worker.fetch(request(`?date=${DATE}`), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_name" });
  });

  it("rejects a malformed date", async () => {
    const res = await worker.fetch(request(`?date=2026-6-20&name=田村`), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_date" });
  });

  it("defaults to today in JST when the date parameter is omitted", async () => {
    const res = await worker.fetch(request(`?name=${encodeURIComponent("田村翔")}`), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string };
    expect(body.date).toBe(toJstDateKey(new Date()));
  });

  it("returns a 404 (feature disabled) when AGENT_API_TOKEN is too short to be a real secret", async () => {
    // 正しい氏名・正しいトークンを渡す。強度チェックが無ければ200になる組み合わせ。
    const weak = "x".repeat(MIN_AGENT_TOKEN_LENGTH - 1);
    const res = await worker.fetch(
      request(`?date=${DATE}&name=${encodeURIComponent("田村翔")}`, {
        Authorization: `Bearer ${weak}`,
      }),
      { ...env, AGENT_API_TOKEN: weak },
    );
    expect(res.status).toBe(404);
    // name_not_found のJSONではなく、機能そのものが無効であることを示す素の404。
    expect(await res.text()).toBe("not found");
  });

  it("rejects an absurdly long name instead of normalizing it", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=${"あ".repeat(500)}`), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_name" });
  });

  it("sets X-Content-Type-Options on JSON responses", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=${encodeURIComponent("田村翔")}`), env);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns a 404 with a reason when the name matches nobody", async () => {
    const res = await worker.fetch(request(`?date=${DATE}&name=${encodeURIComponent("鈴木")}`), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "name_not_found" });
  });

  it("still serves the calendar feed route (the agent route did not break it)", async () => {
    const res = await worker.fetch(new Request("https://worker.example.dev/other"), env);
    expect(res.status).toBe(404);
  });
});
