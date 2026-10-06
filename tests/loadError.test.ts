import { describe, expect, it } from "vitest";
import { describeLoadError } from "../src/hooks/loadError";

describe("describeLoadError", () => {
  it("権限エラーは原因が分かる文にする（再読み込みしても直らないため）", () => {
    expect(describeLoadError({ code: "permission-denied" })).toContain("権限");
  });

  it("それ以外は通信を疑う案内にする", () => {
    expect(describeLoadError(new Error("network"))).toContain("通信");
  });

  it("codeを持たない値でも落ちない", () => {
    expect(describeLoadError(null)).toContain("通信");
    expect(describeLoadError("permission-denied なにか")).toContain("権限");
  });
});
