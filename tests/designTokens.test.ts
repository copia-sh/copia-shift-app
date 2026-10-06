import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("../src", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** 色をここに書いてよい唯一の場所。 */
const PALETTE = join(SRC, "theme", "palette.ts");

const files = sourceFiles(SRC).filter((path) => path !== PALETTE);

describe("配色はトークン経由でしか書かない", () => {
  it("コンポーネントに生の16進を書かない（色は index.css の @theme か theme/palette.ts に置く）", () => {
    const offenders = files.flatMap((path) => {
      const lines = readFileSync(path, "utf8").split("\n");
      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /#[0-9A-Fa-f]{6}\b/.test(line))
        .map(({ line, index }) => `${path.replace(SRC, "src")}:${index + 1}  ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it("Tailwind 既定のパレット（gray/blue/red の番号付き）を使わない", () => {
    const offenders = files.flatMap((path) => {
      const lines = readFileSync(path, "utf8").split("\n");
      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) =>
          /\b(?:text|bg|border|ring|divide|from|via|to|placeholder|accent|outline)-(?:gray|slate|zinc|neutral|stone|blue|red|green|amber|yellow)-[0-9]{2,3}\b/.test(
            line,
          ),
        )
        .map(({ line, index }) => `${path.replace(SRC, "src")}:${index + 1}  ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("CSS変数の参照先が存在すること", () => {
  it("src から参照している var(--…) は index.css で定義されている", () => {
    const css = readFileSync(join(SRC, "index.css"), "utf8");
    const defined = new Set(
      [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    // Tailwind が @theme から生成する変数は index.css に直接は現れない
    const generated = /^--(color|spacing|font|text|radius|shadow|breakpoint)-/;
    const offenders = files.flatMap((path) => {
      const lines = readFileSync(path, "utf8").split("\n");
      return lines.flatMap((line, index) =>
        [...line.matchAll(/var\((--[a-z0-9-]+)/g)]
          .filter(([, name]) => !defined.has(name) && !generated.test(name))
          .map(() => `${path.replace(SRC, "src")}:${index + 1}  ${line.trim()}`),
      );
    });
    expect(offenders).toEqual([]);
  });
});
