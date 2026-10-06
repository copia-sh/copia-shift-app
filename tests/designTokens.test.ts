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
