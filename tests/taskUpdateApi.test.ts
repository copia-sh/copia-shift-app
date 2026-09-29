import { describe, it, expect } from "vitest";
import { buildTaskUpdatePayload, taskUpdateErrorMessage } from "../src/taskUpdateApi";

describe("buildTaskUpdatePayload", () => {
  const task = { kind: "task" as const, no: "4", title: "集計スプシを作る", status: "未着手" };

  it("変えた項目だけ送る（ステータスが同じなら送らない）", () => {
    expect(buildTaskUpdatePayload(task, { status: "未着手", memo: " 草案を作った ", deliverable: "" })).toEqual({
      kind: "task", no: "4", title: "集計スプシを作る", memo: "草案を作った",
    });
    expect(buildTaskUpdatePayload(task, { status: "進行中", memo: "", deliverable: " https://x " })).toEqual({
      kind: "task", no: "4", title: "集計スプシを作る", status: "進行中", deliverable: "https://x",
    });
  });

  it("何も変えていなければ null", () => {
    expect(buildTaskUpdatePayload(task, { status: "未着手", memo: " ", deliverable: "" })).toBeNull();
  });

  it("定例業務は No を空で送る", () => {
    expect(buildTaskUpdatePayload({ kind: "routine", no: "", title: "報告会", status: "運用中" }, { status: "検討中", memo: "", deliverable: "" }))
      .toEqual({ kind: "routine", no: "", title: "報告会", status: "検討中" });
  });
});

describe("taskUpdateErrorMessage", () => {
  it("行が見つからないときはシートの変更を案内する", () => {
    expect(taskUpdateErrorMessage("row_not_found")).toContain("シート");
  });

  it("知らないコードは汎用の文言", () => {
    expect(taskUpdateErrorMessage("whatever")).toBe("反映できませんでした。時間をおいてもう一度お試しください。");
  });
});
