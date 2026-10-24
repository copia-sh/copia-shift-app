import { describe, it, expect } from "vitest";
import { toJstDateKey } from "../src/jstDate";

describe("toJstDateKey", () => {
  it("resolves a UTC instant just before midnight JST to that JST calendar day", () => {
    // 2026-06-15T14:59:59Z = 2026-06-15T23:59:59+09:00
    expect(toJstDateKey(new Date("2026-06-15T14:59:59.000Z"))).toBe("2026-06-15");
  });

  it("rolls over to the next JST calendar day right at the boundary", () => {
    // 2026-06-15T15:00:00Z = 2026-06-16T00:00:00+09:00
    expect(toJstDateKey(new Date("2026-06-15T15:00:00.000Z"))).toBe("2026-06-16");
  });

  it("does not depend on the host runtime's local timezone (pure UTC-epoch math)", () => {
    expect(toJstDateKey(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});
