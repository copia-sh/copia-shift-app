import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker, { type Env } from "../src/index";

describe("worker fetch handler", () => {
  const env: Env = { FIREBASE_PROJECT_ID: "p1", FIREBASE_SERVICE_ACCOUNT_KEY: "{}" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => {
      throw new Error("must not reach Firestore or Google OAuth");
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

  it("no longer serves the removed calendar feed route, and never touches Firestore for it", async () => {
    const res = await worker.fetch(new Request("https://worker.example.dev/feed/g1/tok-abc.ics"), env);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
