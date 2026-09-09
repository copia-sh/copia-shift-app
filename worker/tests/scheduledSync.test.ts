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

const controller = { scheduledTime: 0, cron: "*/5 * * * *", noRetry: () => {} } as unknown as ScheduledController;
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

/** Sheets とFirestoreエミュレータの両方に応じる fetch。Sheets 側の応答だけ差し替えられる。 */
function stubFetch(sheetsResponder: (url: string) => Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "sheets-token" }), { status: 200 });
    }
    if (url.startsWith("https://sheets.googleapis.com/")) return sheetsResponder(url);
    if (url.endsWith("/settings/shiftTypes")) return new Response(null, { status: 404 });
    if (url.endsWith(":runQuery")) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const sheetsOk = (url: string) =>
  url.includes(":clear") || url.includes(":batchUpdate") || url.includes("?valueInputOption")
    ? new Response("{}", { status: 200 })
    : new Response(JSON.stringify({ sheets: [{ properties: { title: "シフト同期" } }] }), { status: 200 });

describe("scheduled shift sync", () => {
  let env: Env;

  beforeEach(async () => {
    env = {
      FIREBASE_PROJECT_ID: "p1",
      FIREBASE_SERVICE_ACCOUNT_KEY: await generateServiceAccountJson(),
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      AGENT_GROUP_ID: "g1",
      SHIFT_SYNC_SPREADSHEET_ID: "1TestSpreadsheetIdForUnitTests_00",
      SHIFT_SYNC_ENABLED: "true",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing at all when SHIFT_SYNC_ENABLED is not \"true\"", async () => {
    const fetchMock = stubFetch(sheetsOk);
    vi.stubGlobal("fetch", fetchMock);

    for (const value of [undefined, "false", "TRUE", ""]) {
      await worker.scheduled(controller, { ...env, SHIFT_SYNC_ENABLED: value }, ctx);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs and skips when enabled without a spreadsheet id, instead of throwing", async () => {
    const fetchMock = stubFetch(sheetsOk);
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await worker.scheduled(controller, { ...env, SHIFT_SYNC_SPREADSHEET_ID: undefined }, ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("writes the sheet when enabled and configured", async () => {
    const fetchMock = stubFetch(sheetsOk);
    vi.stubGlobal("fetch", fetchMock);

    await worker.scheduled(controller, env, ctx);

    const sheetsUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.startsWith("https://sheets.googleapis.com/"));
    expect(sheetsUrls.some((url) => url.includes(":clear"))).toBe(true);
    expect(sheetsUrls.some((url) => url.includes("?valueInputOption=RAW"))).toBe(true);
  });

  it("rejects so the cron run is reported as failed when Sheets errors", async () => {
    vi.stubGlobal("fetch", stubFetch(() => new Response(null, { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(worker.scheduled(controller, env, ctx)).rejects.toThrow();
  });
});
