import { describe, it, expect } from "vitest";
import { buildRowUpdates, columnLetter, parseTaskUpdate } from "../src/taskUpdate";

const TASK_ROWS = [
  ["フェーズ", "No", "担当インターン生", "タスク内容", "ステータス", "状況メモ", "最新の成果物"],
  ["P1", "1", "佐藤", "講座を整理する", "進行中", "2026-09-10: 一旦完成", ""],
  ["P1", "2", "田村", "ナレッジを検討する", "検討中"],
];
const ROUTINE_ROWS = [
  ["頻度", "タスク内容", "ステータス", "状況メモ"],
  ["毎週", "報告会の準備", "検討中", ""],
];

describe("columnLetter", () => {
  it("0始まりの列番号をA1表記にする", () => {
    expect([0, 6, 25, 26].map(columnLetter)).toEqual(["A", "G", "Z", "AA"]);
  });
});

describe("parseTaskUpdate", () => {
  const base = { kind: "task", no: "1", title: "講座を整理する" };

  it("ステータス・メモ・成果物のどれか1つは要る", () => {
    expect(parseTaskUpdate(base)).toEqual({ ok: false, error: "nothing_to_update" });
    expect(parseTaskUpdate({ ...base, status: "完了" })).toMatchObject({ ok: true, value: { status: "完了" } });
  });

  it("決められたステータス以外は受け付けない", () => {
    expect(parseTaskUpdate({ ...base, status: "=HYPERLINK(1)" })).toEqual({ ok: false, error: "invalid_status" });
  });

  it("メモは改行を空白にし、長すぎれば弾く", () => {
    expect(parseTaskUpdate({ ...base, memo: " 草案を\n作成 " })).toMatchObject({ ok: true, value: { memo: "草案を 作成" } });
    expect(parseTaskUpdate({ ...base, memo: "あ".repeat(1001) })).toEqual({ ok: false, error: "memo_too_long" });
  });

  it("成果物が数式の記号で始まるときは ' を付ける（CSV/Excel に書き出して開いたときに実行させない）", () => {
    expect(parseTaskUpdate({ ...base, deliverable: '=HYPERLINK("http://x")' })).toMatchObject({ ok: true, value: { deliverable: `'=HYPERLINK("http://x")` } });
    expect(parseTaskUpdate({ ...base, deliverable: "@cmd" })).toMatchObject({ ok: true, value: { deliverable: "'@cmd" } });
    expect(parseTaskUpdate({ ...base, deliverable: "https://example.com" })).toMatchObject({ ok: true, value: { deliverable: "https://example.com" } });
  });

  it("種類とタスク名が無ければ不正", () => {
    expect(parseTaskUpdate({ kind: "x", title: "a", status: "完了" })).toEqual({ ok: false, error: "invalid_target" });
    expect(parseTaskUpdate({ kind: "task", title: " ", status: "完了" })).toEqual({ ok: false, error: "invalid_target" });
    expect(parseTaskUpdate(null)).toEqual({ ok: false, error: "invalid_target" });
  });
});

describe("buildRowUpdates", () => {
  const date = "2026-09-29";

  it("Noとタスク名で行を特定し、ステータスを替えてメモを日付・名前付きで追記する", () => {
    const result = buildRowUpdates(TASK_ROWS, { kind: "task", no: "1", title: "講座を整理する", status: "完了", memo: "納品した" }, "田村駿貴", date);
    expect(result).toEqual({
      ok: true,
      cells: [
        { range: "E2", value: "完了" },
        { range: "F2", value: "2026-09-10: 一旦完成 2026-09-29: 納品した（田村駿貴）" },
      ],
    });
  });

  it("行末が欠けた行でも列を足して書ける", () => {
    const result = buildRowUpdates(TASK_ROWS, { kind: "task", no: "2", title: "ナレッジを検討する", deliverable: "https://example.com/a" }, "佐藤", date);
    expect(result).toEqual({ ok: true, cells: [{ range: "G3", value: "https://example.com/a" }] });
  });

  it("定例業務はタスク名で特定する", () => {
    const result = buildRowUpdates(ROUTINE_ROWS, { kind: "routine", no: "", title: "報告会の準備", memo: "テンプレ更新" }, "曽根", date);
    expect(result).toEqual({ ok: true, cells: [{ range: "D2", value: "2026-09-29: テンプレ更新（曽根）" }] });
  });

  it("タスク名の改行・連続した空白は1つの空白として比べる", () => {
    const rows = [TASK_ROWS[0], ["P1", "3", "", "週次報告会の準備をする\n（テンプレ1枚）", "検討中"]];
    const result = buildRowUpdates(rows, { kind: "task", no: "3", title: "週次報告会の準備をする （テンプレ1枚）", status: "進行中" }, "a", date);
    expect(result).toEqual({ ok: true, cells: [{ range: "E2", value: "進行中" }] });
  });

  it("行が見つからない・複数ある・列が無いときは書かない", () => {
    expect(buildRowUpdates(TASK_ROWS, { kind: "task", no: "9", title: "講座を整理する", status: "完了" }, "a", date)).toEqual({ ok: false, error: "row_not_found" });
    expect(buildRowUpdates([...TASK_ROWS, TASK_ROWS[1]], { kind: "task", no: "1", title: "講座を整理する", status: "完了" }, "a", date)).toEqual({ ok: false, error: "ambiguous_row" });
    expect(buildRowUpdates([["No", "タスク内容"], ["1", "x"]], { kind: "task", no: "1", title: "x", status: "完了" }, "a", date)).toEqual({ ok: false, error: "column_missing" });
  });
});
