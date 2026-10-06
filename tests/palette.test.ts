import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR, cssTokenOf, MEMBER_COLORS, type ColorKey } from "../src/theme/palette";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function tokensInTheme(): Map<string, string> {
  const start = css.indexOf("@theme");
  const theme = css.slice(start, css.indexOf("\n}", start));
  const found = new Map<string, string>();
  for (const line of theme.split("\n")) {
    const match = line.match(/(--color-[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/);
    if (match) found.set(match[1], match[2].toUpperCase());
  }
  return found;
}

describe("配色の定義がひとつであること", () => {
  const tokens = tokensInTheme();

  it("index.css の @theme からトークンを読めている", () => {
    expect(tokens.size).toBeGreaterThan(30);
  });

  it("palette.ts の色は index.css の同名トークンと一致する", () => {
    for (const key of Object.keys(COLOR) as ColorKey[]) {
      const token = cssTokenOf(key);
      expect(tokens.get(token), `${key} (${token})`).toBe(COLOR[key].toUpperCase());
    }
  });

  it("メンバーの色は重複しない", () => {
    expect(new Set(MEMBER_COLORS).size).toBe(MEMBER_COLORS.length);
  });

  it("トークンは重複した値を持たない（同じ色に別名を付けない）", () => {
    const byValue = new Map<string, string[]>();
    for (const [name, value] of tokens) {
      byValue.set(value, [...(byValue.get(value) ?? []), name]);
    }
    expect([...byValue.entries()].filter(([, names]) => names.length > 1)).toEqual([]);
  });
});
