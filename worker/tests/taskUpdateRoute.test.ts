import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleTaskUpdate, type TaskUpdateEnv } from "../src/taskUpdateRoute";

const ORIGIN = "https://copia-sh.github.io";
const TASK_TAB = [
  ["No", "タスク内容", "ステータス", "状況メモ", "最新の成果物"],
  ["1", "講座を整理する", "進行中", "", ""],
];
const ROUTINE_TAB = [["頻度", "タスク内容", "ステータス"], ["毎週", "報告会の準備", "運用中"]];

function env(over: Partial<TaskUpdateEnv> = {}): TaskUpdateEnv {
  return {
    FIREBASE_PROJECT_ID: "p1",
    FIREBASE_SERVICE_ACCOUNT_KEY: "{}",
    AGENT_GROUP_ID: "g1",
    TASK_BOARD_SPREADSHEET_ID: "1TestSpreadsheetIdForUnitTests_00",
    TASK_EDIT_ENABLED: "true",
    TASK_API_ALLOWED_ORIGIN: ORIGIN,
    ...over,
  };
}

function request(body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://worker.example/tasks/update", {
    method,
    headers: { Origin: ORIGIN, Authorization: "Bearer good", "Content-Type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const member = (active = true) => ({ id: "uid-1", data: { active, displayName: "田村駿貴" } });

function deps(memberDoc: { id: string; data: Record<string, unknown> } | null = member()) {
  const setDocument = vi.fn(async () => {});
  return {
    verifyToken: vi.fn(async (token: string) => (token === "good" ? "uid-1" : null)),
    connect: vi.fn(async () => ({
      firestore: { getDocument: vi.fn(async () => memberDoc), setDocument },
      sheetsToken: "sheets-token",
    })),
    now: () => new Date("2026-09-29T03:00:00Z"),
    setDocument,
  };
}

function stubSheets() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    if (url.includes(":batchUpdate")) return new Response("{}", { status: 200 });
    if (url.includes(":batchGet")) {
      return new Response(JSON.stringify({ valueRanges: [{ values: TASK_TAB }, { values: ROUTINE_TAB }] }), { status: 200 });
    }
    if (url.includes("/values/'タスク一覧'!A:Z")) return new Response(JSON.stringify({ values: TASK_TAB }), { status: 200 });
    throw new Error(`unexpected fetch: ${url} ${init?.method}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("handleTaskUpdate", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const body = { kind: "task", no: "1", title: "講座を整理する", status: "完了", memo: "納品した" };

  it("無効なら経路が無いものとして 404", async () => {
    const res = await handleTaskUpdate(request(body), env({ TASK_EDIT_ENABLED: "false" }), deps());
    expect(res.status).toBe(404);
  });

  it("許可したオリジン以外は 403、プリフライトには CORS ヘッダーを返す", async () => {
    expect((await handleTaskUpdate(request(body, { Origin: "https://evil.example" }), env(), deps())).status).toBe(403);
    const preflight = await handleTaskUpdate(request(null, {}, "OPTIONS"), env(), deps());
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("トークンが無い・不正なら 401、在籍メンバーでなければ 403", async () => {
    expect((await handleTaskUpdate(request(body, { Authorization: "" }), env(), deps())).status).toBe(401);
    expect((await handleTaskUpdate(request(body, { Authorization: "Bearer bad" }), env(), deps())).status).toBe(401);
    expect((await handleTaskUpdate(request(body), env(), deps(null))).status).toBe(403);
    expect((await handleTaskUpdate(request(body), env(), deps(member(false)))).status).toBe(403);
  });

  it("入力が不正なら書かずに 400", async () => {
    const fetchMock = stubSheets();
    const res = await handleTaskUpdate(request({ ...body, status: "やった" }), env(), deps());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_status" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("シートの該当セルを RAW で書き、タスク表を取り込み直す", async () => {
    const fetchMock = stubSheets();
    const d = deps();
    const res = await handleTaskUpdate(request(body), env(), d);

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const write = fetchMock.mock.calls.find(([url]) => String(url).includes(":batchUpdate"));
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({
      valueInputOption: "RAW",
      data: [
        { range: "'タスク一覧'!C2", values: [["完了"]] },
        { range: "'タスク一覧'!D2", values: [["2026-09-29: 納品した（田村駿貴）"]] },
      ],
    });
    expect(d.setDocument).toHaveBeenCalledWith("groups/g1/taskBoard/current", expect.objectContaining({ syncedAt: Date.parse("2026-09-29T03:00:00Z") }));
  });

  it("行が見つからなければ書かずに 409", async () => {
    const fetchMock = stubSheets();
    const res = await handleTaskUpdate(request({ ...body, title: "別のタスク" }), env(), deps());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "row_not_found" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(":batchUpdate"))).toBe(false);
  });
});
