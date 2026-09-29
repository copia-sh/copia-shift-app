import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker, { shouldSyncTasks, type Env } from "../src/index";

async function generateServiceAccountJson(): Promise<string> {
  const { exportPKCS8 } = await import("jose");
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  return JSON.stringify({ client_email: "bot@project.iam.gserviceaccount.com", private_key: await exportPKCS8(privateKey) });
}

const controller = { scheduledTime: 0, cron: "*/5 * * * *", noRetry: () => {} } as unknown as ScheduledController;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

const BOARD_PATH = "/groups/g1/taskBoard/current";
const valueRanges = {
  valueRanges: [
    { values: [["No", "タスク内容", "ステータス"], ["1", "講座を整理する", "進行中"]] },
    { values: [["頻度", "タスク内容", "ステータス"], ["毎週", "報告会の準備", "運用中"]] },
  ],
};

function stubFetch({ sheetsStatus = 200 } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "sheets-token" }), { status: 200 });
    }
    if (url.includes(":batchGet")) return new Response(JSON.stringify(valueRanges), { status: sheetsStatus });
    if (url.endsWith(BOARD_PATH)) return new Response("{}", { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const boardWrites = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith(BOARD_PATH) && init?.method === "PATCH");

describe("shouldSyncTasks", () => {
  it("15分ごと（0・15・30・45分）だけ true", () => {
    expect([0, 15, 30, 45].map((m) => shouldSyncTasks(new Date(Date.UTC(2026, 8, 29, 2, m))))).toEqual([true, true, true, true]);
    expect([5, 10, 50].map((m) => shouldSyncTasks(new Date(Date.UTC(2026, 8, 29, 2, m))))).toEqual([false, false, false]);
  });
});

describe("scheduled task board sync", () => {
  let env: Env;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T02:15:00Z"));
    env = {
      FIREBASE_PROJECT_ID: "p1",
      FIREBASE_SERVICE_ACCOUNT_KEY: await generateServiceAccountJson(),
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      AGENT_GROUP_ID: "g1",
      TASK_BOARD_SPREADSHEET_ID: "1TestSpreadsheetIdForUnitTests_00",
      TASK_SYNC_ENABLED: "true",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("有効なら15分の回にシートを読んで taskBoard/current を書く", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);

    await worker.scheduled(controller, env, ctx);

    expect(boardWrites(fetchMock)).toHaveLength(1);
  });

  it("15分の回以外では何もしない", async () => {
    vi.setSystemTime(new Date("2026-09-29T02:05:00Z"));
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);

    await worker.scheduled(controller, env, ctx);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TASK_SYNC_ENABLED が "true" 以外なら何もしない', async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);

    for (const value of [undefined, "false", "TRUE", ""]) {
      await worker.scheduled(controller, { ...env, TASK_SYNC_ENABLED: value }, ctx);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("シートIDが未設定ならログを残して飛ばす", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await worker.scheduled(controller, { ...env, TASK_BOARD_SPREADSHEET_ID: undefined }, ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("シートの読み取りに失敗したら Cron を失敗させ、書き込まない", async () => {
    const fetchMock = stubFetch({ sheetsStatus: 500 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(worker.scheduled(controller, env, ctx)).rejects.toThrow();
    expect(boardWrites(fetchMock)).toHaveLength(0);
  });

  it("シフト同期が失敗してもタスク同期は実行し、Cron は失敗として残す", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://sheets.googleapis.com/") && !url.includes(":batchGet")) {
        return new Response(null, { status: 500 });
      }
      if (url.endsWith(":runQuery")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.endsWith("/settings/shiftTypes")) return new Response(null, { status: 404 });
      return stubFetch()(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      worker.scheduled(controller, { ...env, SHIFT_SYNC_ENABLED: "true", SHIFT_SYNC_SPREADSHEET_ID: "1TestSpreadsheetIdForUnitTests_01" }, ctx),
    ).rejects.toThrow();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith(BOARD_PATH) && init?.method === "PATCH")).toBe(true);
  });
});
