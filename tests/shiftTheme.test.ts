import { describe, it, expect } from "vitest";
import {
  mixHex,
  lighten,
  darken,
  buildShiftTheme,
} from "../src/components/shiftTheme";
import { DEFAULT_SHIFT_TYPES, REJECTED_TYPE } from "../src/types";

describe("shiftTheme - Color functions", () => {
  it("mixHex with t=0 returns a", () => {
    const result = mixHex("#000000", "#ffffff", 0);
    expect(result).toBe("#000000");
  });

  it("mixHex with t=1 returns b", () => {
    const result = mixHex("#000000", "#ffffff", 1);
    expect(result).toBe("#ffffff");
  });

  it("mixHex with t=0.5 returns a midpoint", () => {
    const result = mixHex("#000000", "#ffffff", 0.5);
    expect(result).toMatch(/^#808080$/i);
  });

  it("lighten makes color lighter", () => {
    const base = "#248DD4";
    const light = lighten(base, 0.5);
    const baseBg = parseInt(base.slice(1, 3), 16);
    const lightBg = parseInt(light.slice(1, 3), 16);
    expect(lightBg).toBeGreaterThan(baseBg);
  });

  it("darken makes color darker", () => {
    const base = "#248DD4";
    const dark = darken(base, 0.5);
    const baseBg = parseInt(base.slice(1, 3), 16);
    const darkBg = parseInt(dark.slice(1, 3), 16);
    expect(darkBg).toBeLessThan(baseBg);
  });
});

describe("shiftTheme - buildShiftTheme", () => {
  it("creates theme from DEFAULT_SHIFT_TYPES", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    expect(theme.types).toEqual(DEFAULT_SHIFT_TYPES);
  });

  it("cycleKeys contains available types in order", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    expect(theme.cycleKeys).toEqual(["出勤", "リモート", "欠勤"]);
  });

  it("unavailableKeys includes unavailable types and REJECTED_TYPE", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    expect(theme.unavailableKeys.has("欠勤")).toBe(true);
    expect(theme.unavailableKeys.has(REJECTED_TYPE)).toBe(true);
    expect(theme.unavailableKeys.has("出勤")).toBe(false);
  });

  it("defOf returns the type definition for known key", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const def = theme.defOf("出勤");
    expect(def.label).toBe("出勤");
    expect(def.color).toBe("#248DD4");
  });

  it("defOf returns fallback for unknown key", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const def = theme.defOf("存在しないキー");
    expect(def.label).toBe("存在しないキー");
    expect(def.color).toBe("#999999");
  });

  it("skinFor fixed state has white text and no shadow", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skin = theme.skinFor(
      { kind: "fixed", type: "出勤", startTime: null, endTime: null },
      false,
    );
    expect(skin.fg).toBe("#ffffff");
    expect(skin.shadow).toBe("");
    expect(skin.mark).toBe("✓");
    expect(skin.label).toBe("出勤");
  });

  it("skinFor want state has dashed border", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skin = theme.skinFor(
      { kind: "want", type: "出勤", startTime: null, endTime: null },
      false,
    );
    expect(skin.borderStyle).toBe("dashed");
    expect(skin.borderWidth).toBe("1.5px");
    expect(skin.label).toBe("出勤希望");
  });

  it("skinFor no state has unavailable style", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skin = theme.skinFor(
      { kind: "no", type: "欠勤", startTime: null, endTime: null },
      false,
    );
    expect(skin.borderStyle).toBe("solid");
    expect(skin.borderWidth).toBe("1px");
  });

  it("skinFor no state with REJECTED_TYPE shows correct label", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skin = theme.skinFor(
      { kind: "no", type: REJECTED_TYPE, startTime: null, endTime: null },
      false,
    );
    expect(skin.label).toBe("却下");
  });

  it("defOf REJECTED_TYPE has orange color", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const def = theme.defOf(REJECTED_TYPE);
    expect(def.color).toBe("#E08A2E");
    expect(def.label).toBe("却下");
    expect(def.mark).toBe("×");
  });

  it("skinFor no state with REJECTED_TYPE has orange background", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skin = theme.skinFor(
      { kind: "no", type: REJECTED_TYPE, startTime: null, endTime: null },
      false,
    );
    expect(skin.fg).toBe("#E08A2E");
    expect(skin.mark).toBe("×");
  });

  it("skinFor none state has gray color", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skin = theme.skinFor(
      { kind: "none", type: "", startTime: null, endTime: null },
      false,
    );
    expect(skin.bg).toBe("#ffffff");
    expect(skin.fg).toBe("#C8CDD2");
    expect(skin.mark).toBe("·");
    expect(skin.label).toBe("未回答");
  });

  // 文字列比較だと大文字小文字の違いだけで「異なる」と誤判定されるので、
  // 必ず輝度（実際の見え方）で比べる。
  const luminance = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  };

  it.each(["fixed", "want", "no"] as const)(
    "%s は選択中のほうが実際に濃くなる",
    (kind) => {
      const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
      const type = kind === "no" ? "欠勤" : "出勤";
      const st = { kind, type, startTime: null, endTime: null };
      const off = theme.skinFor(st, false);
      const on = theme.skinFor(st, true);
      expect(luminance(on.bg)).toBeLessThan(luminance(off.bg));
    },
  );

  it("skinFor none state selected has lightened blue bg", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const skinSelected = theme.skinFor(
      { kind: "none", type: "", startTime: null, endTime: null },
      true,
    );
    expect(skinSelected.bg).toBe(lighten("#248DD4", 0.88));
  });
});

describe("shiftTheme - cycleKeys behavior", () => {
  it("cycles through available types", () => {
    const types = DEFAULT_SHIFT_TYPES;
    const available = types.filter((t) => t.attendance === "available").map((t) => t.key);
    const theme = buildShiftTheme(types);
    expect(theme.cycleKeys.slice(0, available.length)).toEqual(available);
  });

  it("includes first unavailable type at the end", () => {
    const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
    const lastCycleKey = theme.cycleKeys[theme.cycleKeys.length - 1];
    const typeDef = DEFAULT_SHIFT_TYPES.find((t) => t.key === lastCycleKey);
    expect(typeDef?.attendance).toBe("unavailable");
  });
});
