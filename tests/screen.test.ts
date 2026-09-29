import { describe, it, expect } from "vitest";
import { hashForScreen, screenFromHash } from "../src/hooks/screen";

describe("screenFromHash / hashForScreen", () => {
  it("#tasks だけタスク画面", () => {
    expect(screenFromHash("#tasks")).toBe("tasks");
    expect(screenFromHash("")).toBe("shifts");
    expect(screenFromHash("#other")).toBe("shifts");
  });

  it("シフト画面はハッシュを付けない", () => {
    expect(hashForScreen("tasks")).toBe("#tasks");
    expect(hashForScreen("shifts")).toBe("");
  });
});
