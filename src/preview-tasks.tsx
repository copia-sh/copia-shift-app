import { createRoot } from "react-dom/client";
import "./index.css";
import { ScreenFooter } from "./components/ScreenSwitcher";
import { TaskBoardView } from "./components/taskBoard/TaskBoardView";
import type { BoardRoutine, BoardTask, TaskBoardState } from "./taskBoard";
import type { Member } from "./types";

// Firebase を使わずにタスク画面の見た目を確認するためのページ（`/preview-tasks.html?state=ready&me=田村駿貴`）。
// 公開リポジトリなので、状況メモやURLは架空のもの。

const members: Member[] = ["田村駿貴", "佐藤広幸", "曽根大智", "赤間"].map((displayName, index) => ({
  id: `m${index + 1}`,
  email: `m${index + 1}@example.com`,
  displayName,
  color: ["#248DD4", "#1F8A98", "#E08A2E", "#D9736F"][index],
  role: index === 0 ? "admin" : "member",
  active: true,
  shiftTarget: true,
  attributes: [],
  joinedAt: null,
}));

const routine = (frequency: string, title: string, assignees: string[], status: string, memo = ""): BoardRoutine => ({
  frequency, title, purpose: "", assignees, status, memo, deliverable: "",
});
const task = (no: string, title: string, assignees: string[], due: string, priority: string, status: string): BoardTask => ({
  no, phase: "フェーズ1：型化・素材準備", title, purpose: "", assignees, due, priority, status, memo: "", deliverable: "",
});

const routines: BoardRoutine[] = [
  routine("毎週", "週次報告会の準備をする（テンプレ1枚、話す内容：①数字②成果物③来週④困りごと）", ["未定"], "検討中"),
  routine("毎月（20日まで）", "翌月分のシフトをシステムへ入力する", ["全員（毎月入力）"], "運用中"),
  routine("毎出勤日", "自習室で答えに詰まった質問を全員で共有する", ["曽根（着手）", "田村", "佐藤"], "運用中"),
  routine("毎週", "タスク表の更新", ["田村", "佐藤", "曽根"], "進行中"),
  routine("毎出勤日（平日昼に入れる日）", "AIリテラシー向上の自己学習を行う（2〜4時間程度）", ["田村", "佐藤", "曽根"], "未着手"),
  routine("定期（平日夜・休日昼）", "自習室を定期開催・運営する（Zoomで会員の質問に答え、AIを使いこなせるよう支援する）", ["田村", "佐藤", "曽根"], "運用中",
    "2026-09-22: 初回を実施した（架空のメモ）。2026-09-28: コンテンツ部の回に2名が参加した（架空のメモ）。"),
];

const tasks: BoardTask[] = [
  task("1", "既存全28講座を「客層」「レベル」「解決できる課題」の観点で整理する", ["佐藤"], "随時", "中", "進行中"),
  task("2", "AI活用ナレッジ検索スプレッドシートの実現可能性を検討する", ["田村"], "未定", "中", "検討中"),
  task("3", "上級者向け活用事例（Slack Botなど高度なAI活用事例）を拡充する", ["未定"], "来月", "低", "未着手"),
  { ...task("4", "自習室実施後アンケートの回答集計スプレッドシートと自動化用GASを作る", ["佐藤"], "随時（早期）", "中", "未着手"),
    purpose: "自習室の満足度・質問傾向を定量的に把握し改善につなげる",
    memo: "2026-09-20: アンケートフォームの草案は作成済み（架空のメモ）。",
    deliverable: "自習室実施後アンケート（草案）https://docs.google.com/forms/d/example/edit" },
  task("5", "遠藤さんと連携し、会社のClaudeアカウントを自習室で使える状態にする", ["佐藤"], "平日中", "中", "未着手"),
  task("6", "質問が少ない時間に使う実践コンテンツ（JEVなど話題のツール）を用意する", ["曽根"], "随時", "最重要", "未着手"),
];

const params = new URLSearchParams(window.location.search);
const now = Date.parse("2026-09-28T08:15:00Z");
const kind = params.get("state") ?? "ready";
const syncedAt = kind === "stale" ? now - 95 * 60 * 1000 : now;
const state: TaskBoardState =
  kind === "ready" || kind === "stale"
    ? { kind: "ready", board: { syncedAt, sourceUrl: "https://docs.google.com/spreadsheets/d/example/edit", tasks, routines } }
    : ({ kind } as TaskBoardState);
const me = members.find((member) => member.displayName === params.get("me")) ?? members[0];

createRoot(document.getElementById("root")!).render(
  <>
    <TaskBoardView
      state={state}
      groupId="preview"
      members={members}
      currentMember={me}
      groups={[{ id: "preview", name: "スタダチーム", ownerId: "m1", createdAt: null }]}
      onChangeGroup={() => {}}
      onCreateNewGroup={() => {}}
      onChangeScreen={() => {}}
      adminMenuItems={[{ key: "settings", label: "グループ設定", onSelect: () => {} }]}
      accountMenuItems={[{ key: "signout", label: "ログアウト", onSelect: () => {} }]}
      onExport={() => {}}
      fixedNow={now}
      initialScope={params.get("scope") ?? undefined}
      initialSelectedKey={params.get("open") ?? undefined}
      onSubmitUpdate={async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 400))}
    />
    <ScreenFooter screen="tasks" onChange={() => {}} />
  </>,
);
