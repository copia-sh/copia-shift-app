import { describe, it, expect } from "vitest";
import {
  boardStateFromError,
  boardStateFromSnapshot,
  buildTaskBoardPayload,
  countStatuses,
  filterBoardItems,
  findMemberForAssignee,
  resolveScope,
  formatElapsed,
  formatSyncTime,
  isAssignedTo,
  isStale,
  isUnassigned,
  parseDeliverables,
  parseRoutineRows,
  parseTaskBoardDoc,
  parseTaskRows,
  splitAssignees,
  splitMemo,
  TASK_BOARD_STALE_MS,
} from "../src/taskBoard";

const TASK_HEADER = [
  "フェーズ", "No", "面談前準備", "チーム", "区分", "担当インターン生", "タスク内容",
  "背景・目的", "期限目安", "優先度", "ステータス", "状況メモ", "最新の成果物", "出典",
];
const ROUTINE_HEADER = ["頻度", "タスク内容", "目的", "担当インターン生", "ステータス", "状況メモ", "最新の成果物", "出典"];

describe("splitAssignees", () => {
  it("中黒で分け、（共同）だけを落とす", () => {
    expect(splitAssignees("田村・佐藤・曽根（共同）")).toEqual(["田村", "佐藤", "曽根"]);
  });

  it("（着手）などの補足は表示用に残す", () => {
    expect(splitAssignees("曽根（着手）・田村・佐藤")).toEqual(["曽根（着手）", "田村", "佐藤"]);
  });

  it("空欄は未定として扱う", () => {
    expect(splitAssignees("  ")).toEqual(["未定"]);
  });

  it("全員〜はひとまとまりのまま", () => {
    expect(splitAssignees("全員（毎月入力）")).toEqual(["全員（毎月入力）"]);
  });
});

describe("isAssignedTo", () => {
  it("姓だけの担当者名を、姓名が続けて書かれた表示名に照合する", () => {
    expect(isAssignedTo(["佐藤"], "佐藤広幸")).toBe(true);
    expect(isAssignedTo(["佐藤"], "佐藤 広幸")).toBe(true);
  });

  it("補足付きの担当者名も本人の担当になる", () => {
    expect(isAssignedTo(["曽根（着手）", "田村"], "曽根")).toBe(true);
  });

  it("全員〜は誰の担当にもなる", () => {
    expect(isAssignedTo(["全員（毎月入力）"], "赤間")).toBe(true);
  });

  it("未定・別人は本人の担当にならない", () => {
    expect(isAssignedTo(["未定"], "田村駿貴")).toBe(false);
    expect(isAssignedTo(["佐藤"], "田村駿貴")).toBe(false);
  });

  it("表示名が空なら誰の担当にもしない", () => {
    expect(isAssignedTo(["佐藤"], "")).toBe(false);
  });
});

describe("isUnassigned", () => {
  it("未定だけのときに true", () => {
    expect(isUnassigned(["未定"])).toBe(true);
    expect(isUnassigned(["佐藤"])).toBe(false);
  });
});

describe("parseTaskRows", () => {
  it("ヘッダー名で列を探してタスクに変換する", () => {
    const rows = [
      TASK_HEADER,
      ["フェーズ1", "4", "FALSE", "スタダ", "新出アクション", "佐藤", "集計スプシを作る", "把握する", "随時（早期）", "中", "未着手", "メモ", "成果物", "出典"],
    ];
    expect(parseTaskRows(rows)).toEqual([
      {
        no: "4", phase: "フェーズ1", title: "集計スプシを作る", purpose: "把握する", assignees: ["佐藤"],
        due: "随時（早期）", priority: "中", status: "未着手", memo: "メモ", deliverable: "成果物",
      },
    ]);
  });

  it("列の並びが変わっても読める", () => {
    const rows = [
      ["タスク内容", "ステータス", "No"],
      ["並べ替え後", "進行中", "2"],
    ];
    const [task] = parseTaskRows(rows);
    expect(task.title).toBe("並べ替え後");
    expect(task.status).toBe("進行中");
    expect(task.assignees).toEqual(["未定"]);
    expect(task.memo).toBe("");
  });

  it("タスク内容が空の行と、行末が欠けた行を扱える", () => {
    const rows = [TASK_HEADER, [], ["", "5"], ["フェーズ0", "6", "FALSE", "スタダ", "区分", "曽根", "短い行"]];
    const tasks = parseTaskRows(rows);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("短い行");
    expect(tasks[0].status).toBe("");
  });

  it("必須列が無ければ失敗させる（シートの構造変更に気づけるように）", () => {
    expect(() => parseTaskRows([["No", "担当インターン生"]])).toThrow(/タスク内容/);
    expect(() => parseTaskRows([])).toThrow();
  });
});

describe("parseRoutineRows", () => {
  it("定例業務の行を変換する", () => {
    const rows = [
      ROUTINE_HEADER,
      ["定期（平日夜・休日昼）", "自習室を運営する", "支援", "田村・佐藤・曽根", "運用中", "メモ", "カレンダー", "出典"],
    ];
    expect(parseRoutineRows(rows)).toEqual([
      {
        frequency: "定期（平日夜・休日昼）", title: "自習室を運営する", purpose: "支援",
        assignees: ["田村", "佐藤", "曽根"], status: "運用中", memo: "メモ", deliverable: "カレンダー",
      },
    ]);
  });
});

describe("splitMemo", () => {
  it("日付ごとに分ける", () => {
    expect(splitMemo("2026-09-14: 運用整理。2026-09-20: 草案を作成。")).toEqual([
      { date: "2026-09-14", text: "運用整理。" },
      { date: "2026-09-20", text: "草案を作成。" },
    ]);
  });

  it("時刻付きの日付と、日付の無い前置きを扱う", () => {
    expect(splitMemo("社内中心 / 2026-09-10 15:28 JST: GPTで練習")).toEqual([
      { date: null, text: "社内中心 /" },
      { date: "2026-09-10", text: "GPTで練習" },
    ]);
  });

  it("空なら空配列", () => {
    expect(splitMemo("  ")).toEqual([]);
  });
});

describe("parseDeliverables", () => {
  it("URLの前の文字をリンク名にする", () => {
    expect(parseDeliverables("アンケート（草案）https://docs.google.com/forms/d/x/edit")).toEqual([
      { label: "アンケート（草案）", url: "https://docs.google.com/forms/d/x/edit", host: "docs.google.com" },
    ]);
  });

  it("URLだけなら末尾のファイル名をリンク名にする", () => {
    const [link] = parseDeliverables("https://example.slack.com/files/U1/F1/staged.xlsx");
    expect(link.label).toBe("staged.xlsx");
  });

  it("URLの無い成果物は名前だけ返す", () => {
    expect(parseDeliverables("高度AI活用ナレッジ")).toEqual([{ label: "高度AI活用ナレッジ", url: null, host: null }]);
  });

  it("javascript: などのURLはリンクにしない", () => {
    expect(parseDeliverables("javascript:alert(1)")).toEqual([{ label: "javascript:alert(1)", url: null, host: null }]);
  });
});

describe("isStale", () => {
  const now = new Date("2026-09-28T09:00:00Z").getTime();
  it("1時間以上前なら古い", () => {
    expect(isStale(now - TASK_BOARD_STALE_MS, now)).toBe(true);
    expect(isStale(now - TASK_BOARD_STALE_MS + 1, now)).toBe(false);
  });
});

describe("buildTaskBoardPayload / parseTaskBoardDoc", () => {
  const board = {
    tasks: parseTaskRows([TASK_HEADER, ["P", "1", "", "", "", "佐藤", "講座整理", "", "", "", "進行中"]]),
    routines: parseRoutineRows([ROUTINE_HEADER, ["毎週", "報告会の準備", "", "未定", "検討中"]]),
  };

  it("保存した形をそのまま読み戻せる", () => {
    const doc = { syncedAt: 1000, sourceUrl: "https://docs.google.com/spreadsheets/d/abc/edit", payload: buildTaskBoardPayload(board) };
    expect(parseTaskBoardDoc(doc)).toEqual({ syncedAt: 1000, sourceUrl: doc.sourceUrl, ...board });
  });

  it("壊れたドキュメントは null", () => {
    expect(parseTaskBoardDoc(null)).toBeNull();
    expect(parseTaskBoardDoc({ syncedAt: 1, sourceUrl: "", payload: "{" })).toBeNull();
    expect(parseTaskBoardDoc({ syncedAt: "x", sourceUrl: "", payload: "{}" })).toBeNull();
  });

  it("配列の要素が欠けていても文字列で埋める", () => {
    const payload = JSON.stringify({ tasks: [{ title: "だけ" }], routines: "bad" });
    const parsed = parseTaskBoardDoc({ syncedAt: 1, sourceUrl: "https://docs.google.com/x", payload });
    expect(parsed?.tasks[0]).toMatchObject({ title: "だけ", status: "", assignees: ["未定"] });
    expect(parsed?.routines).toEqual([]);
  });

  it("シート以外のURLはリンク先にしない", () => {
    const parsed = parseTaskBoardDoc({ syncedAt: 1, sourceUrl: "javascript:alert(1)", payload: buildTaskBoardPayload(board) });
    expect(parsed?.sourceUrl).toBe("");
  });
});

describe("boardStateFromSnapshot / boardStateFromError", () => {
  const payload = buildTaskBoardPayload({ tasks: [], routines: [] });

  it("ドキュメントが無ければ未同期", () => {
    expect(boardStateFromSnapshot(false, undefined)).toEqual({ kind: "missing" });
  });

  it("読めるドキュメントは表示", () => {
    const state = boardStateFromSnapshot(true, { syncedAt: 5, sourceUrl: "", payload });
    expect(state.kind).toBe("ready");
  });

  it("壊れたドキュメントはエラー", () => {
    expect(boardStateFromSnapshot(true, { payload: 1 })).toEqual({ kind: "error" });
  });

  it("権限エラーとそれ以外を分ける", () => {
    expect(boardStateFromError({ code: "permission-denied" })).toEqual({ kind: "denied" });
    expect(boardStateFromError(new Error("offline"))).toEqual({ kind: "error" });
  });
});

describe("filterBoardItems / countStatuses", () => {
  const items = [
    { title: "a", status: "進行中", assignees: ["佐藤"] },
    { title: "b", status: "未着手", assignees: ["未定"] },
    { title: "c", status: "完了", assignees: ["佐藤"] },
    { title: "d", status: "運用中", assignees: ["全員（毎月入力）"] },
  ];

  it("完了は出さない", () => {
    expect(filterBoardItems(items, { scope: "all", displayName: "佐藤", statuses: null }).map((i) => i.title)).toEqual(["a", "b", "d"]);
  });

  it("自分の担当だけに絞る", () => {
    expect(filterBoardItems(items, { scope: "mine", displayName: "佐藤広幸", statuses: null }).map((i) => i.title)).toEqual(["a", "d"]);
  });

  it("ステータスで絞る（null はすべて）", () => {
    const statuses = new Set(["未着手"]);
    expect(filterBoardItems(items, { scope: "all", displayName: "佐藤", statuses }).map((i) => i.title)).toEqual(["b"]);
  });

  it("ステータスごとの件数を、完了を除いて出現順に数える", () => {
    expect(countStatuses(items)).toEqual([
      { status: "進行中", count: 1 },
      { status: "未着手", count: 1 },
      { status: "運用中", count: 1 },
    ]);
  });
});

describe("formatSyncTime / formatElapsed", () => {
  it("日本時間の M/D HH:mm", () => {
    expect(formatSyncTime(Date.parse("2026-09-28T08:15:00Z"))).toBe("9/28 17:15");
  });

  it("経過時間を時間と分で", () => {
    const now = Date.parse("2026-09-28T08:15:00Z");
    expect(formatElapsed(now - 95 * 60 * 1000, now)).toBe("1時間35分前");
    expect(formatElapsed(now - 60 * 60 * 1000, now)).toBe("1時間前");
    expect(formatElapsed(now - 25 * 60 * 60 * 1000, now)).toBe("25時間前");
  });
});

describe("findMemberForAssignee", () => {
  const members = [
    { id: "a", displayName: "田村駿貴" },
    { id: "b", displayName: "佐藤 広幸" },
  ];

  it("姓・補足付きの担当者名からメンバーを引く", () => {
    expect(findMemberForAssignee("田村", members)?.id).toBe("a");
    expect(findMemberForAssignee("佐藤（着手）", members)?.id).toBe("b");
  });

  it("未定・全員・該当なしは null", () => {
    expect(findMemberForAssignee("未定", members)).toBeNull();
    expect(findMemberForAssignee("全員（毎月入力）", members)).toBeNull();
    expect(findMemberForAssignee("鈴木", members)).toBeNull();
  });

  it("複数人に当たるときは決めない（別人の色で出さない）", () => {
    expect(findMemberForAssignee("佐藤", [...members, { id: "c", displayName: "佐藤花子" }])).toBeNull();
  });
});

describe("resolveScope", () => {
  const me = { id: "me", displayName: "田村駿貴" };
  const members = [me, { id: "b", displayName: "佐藤広幸" }];

  it("自分・全員はそのまま", () => {
    expect(resolveScope("mine", me, members)).toEqual({ scope: "mine", displayName: "田村駿貴", label: "自分" });
    expect(resolveScope("all", me, members)).toEqual({ scope: "all", displayName: "田村駿貴", label: "全員" });
  });

  it("メンバーを選ぶとその人の担当で絞る", () => {
    expect(resolveScope("b", me, members)).toEqual({ scope: "mine", displayName: "佐藤広幸", label: "佐藤広幸" });
  });

  it("いなくなったメンバーは全員に戻す", () => {
    expect(resolveScope("gone", me, members)).toEqual({ scope: "all", displayName: "田村駿貴", label: "全員" });
  });
});
