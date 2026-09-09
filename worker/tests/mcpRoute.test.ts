import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const TOKEN = "mcp-token-for-tests-0123456789ab";
const DATE = "2026-06-20";

function firestoreDocJson(path: string, fields: Record<string, unknown>) {
  const encode = (v: unknown): unknown => {
    if (v === null) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
    if (typeof v === "object") {
      const encoded: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(v as Record<string, unknown>)) encoded[key] = encode(value);
      return { mapValue: { fields: encoded } };
    }
    throw new Error("unsupported test value");
  };
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) encoded[key] = encode(value);
  return { name: `projects/p1/databases/(default)/documents/${path}`, fields: encoded };
}

function collectionIdOf(init: RequestInit | undefined): string {
  const body = JSON.parse(String(init?.body ?? "{}"));
  return body.structuredQuery?.from?.[0]?.collectionId ?? "";
}

describe("MCP /mcp", () => {
  let env: Env;

  beforeEach(() => {
    env = {
      FIREBASE_PROJECT_ID: "p1",
      FIREBASE_SERVICE_ACCOUNT_KEY: "unused-with-emulator",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      AGENT_GROUP_ID: "g1",
      MCP_API_TOKEN: TOKEN,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/groups/g1/settings/shiftTypes")) return new Response(null, { status: 404 });
        if (url.endsWith(":runQuery")) {
          if (collectionIdOf(init) === "members") {
            return new Response(
              JSON.stringify([
                {
                  document: firestoreDocJson("groups/g1/members/u1", {
                    displayName: "田村 翔",
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

  afterEach(() => vi.unstubAllGlobals());

  function request(body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }) {
    return new Request("https://worker.example.dev/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("initializes with the tools capability", async () => {
    const res = await worker.fetch(
      request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } } },
    });
  });

  it("lists only the read-only get_shift tool", async () => {
    const res = await worker.fetch(request({ jsonrpc: "2.0", id: "tools", method: "tools/list" }), env);
    expect(await res.json()).toMatchObject({
      id: "tools",
      result: {
        tools: [
          {
            name: "get_shift",
            annotations: { readOnlyHint: true, destructiveHint: false },
            inputSchema: { required: ["name"], additionalProperties: false },
          },
        ],
      },
    });
  });

  it("returns the requested shift through tools/call", async () => {
    const res = await worker.fetch(
      request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_shift", arguments: { name: "田村翔", date: DATE } },
      }),
      env,
    );
    const body = (await res.json()) as { result: { structuredContent: unknown; isError: boolean } };
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent).toEqual({
      date: DATE,
      name: "田村 翔",
      workStart: "10:00",
      workEnd: "18:00",
      segments: [
        { type: "出勤", label: "出勤", attendance: "available", startTime: "10:00", endTime: "18:00" },
      ],
    });
  });

  it("rejects requests without the separate MCP secret", async () => {
    const res = await worker.fetch(
      request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}),
      env,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("is disabled until MCP_API_TOKEN is configured", async () => {
    const res = await worker.fetch(
      request({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      { ...env, MCP_API_TOKEN: undefined },
    );
    expect(res.status).toBe(404);
  });

  it("does not accept browser-originated calls", async () => {
    const res = await worker.fetch(
      request(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { Authorization: `Bearer ${TOKEN}`, Origin: "https://evil.example" },
      ),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns a tool error for an invalid date without querying Firestore", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const res = await worker.fetch(
      request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_shift", arguments: { name: "田村", date: "2026-02-30" } },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { isError: true } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
