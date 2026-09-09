#!/usr/bin/env node
/**
 * ローカルのFirestoreエミュレータに、Workerの2つのエンドポイントを試すためのダミーデータを入れる。
 * 実際のFirebaseプロジェクト・サービスアカウント鍵は不要(FIRESTORE_EMULATOR_HOST 経由)。
 *
 * 使い方:
 *   # 別ターミナルでエミュレータを起動してから
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node worker/dev-seed.mjs
 *
 * 運用エージェント向けAPIは、`npm run worker:dev` 起動後にこう叩ける
 * (worker/.dev.vars に AGENT_* を入れてから):
 *   curl -H 'Authorization: Bearer <AGENT_API_TOKEN>' \
 *     'http://127.0.0.1:8787/agent/shifts?name=開発用ユーザー'
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST を設定してから実行してください（例: 127.0.0.1:8080）");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-copia";
initializeApp({ projectId });
const db = getFirestore();

const GROUP_ID = "demo-group";
const MEMBER_ID = "demo-member";
const TOKEN = "dev-seed-token-0123456789abcdef";

/** Asia/Tokyo 基準の暦日。Shift.date と、エージェントAPIの既定日(本日)に合わせる。 */
function jstDayPlus(days) {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

await db.doc(`groups/${GROUP_ID}`).set({
  name: "開発用グループ",
  ownerId: MEMBER_ID,
  createdAt: Timestamp.now(),
});

await db.doc(`groups/${GROUP_ID}/members/${MEMBER_ID}`).set({
  email: "demo@example.com",
  displayName: "開発用ユーザー",
  color: "#248DD4",
  role: "admin",
  active: true,
  attributes: [],
  joinedAt: Timestamp.now(),
});

await db.doc(`groups/${GROUP_ID}/shareLinks/${TOKEN}`).set({
  memberId: MEMBER_ID,
  statuses: ["confirmed"],
  typeKeys: ["出勤", "リモート"],
  createdAt: Timestamp.now(),
});

const shifts = [
  // 本日分は2区分に分けてある。エージェントAPIの workStart/workEnd が
  // 区分をまたいで 10:00-18:00 にまとまることを確認するため。
  { date: jstDayPlus(0), status: "confirmed", type: "出勤", startTime: "10:00", endTime: "13:00" },
  { date: jstDayPlus(0), status: "confirmed", type: "リモート", startTime: "14:00", endTime: "18:00" },
  { date: jstDayPlus(1), status: "confirmed", type: "出勤", startTime: "09:00", endTime: "17:00" },
  { date: jstDayPlus(2), status: "confirmed", type: "リモート", startTime: null, endTime: null },
  { date: jstDayPlus(3), status: "desired", type: "出勤", startTime: "09:00", endTime: "17:00" }, // 希望のみ→フィードに出ないはず
];

for (const [i, shift] of shifts.entries()) {
  await db.doc(`groups/${GROUP_ID}/shifts/seed-${i}`).set({
    memberId: MEMBER_ID,
    ...shift,
    createdBy: MEMBER_ID,
    createdAt: Timestamp.now(),
    confirmedBy: shift.status === "confirmed" ? MEMBER_ID : null,
    confirmedAt: shift.status === "confirmed" ? Timestamp.now() : null,
    updatedAt: Timestamp.now(),
  });
}

console.log("投入完了。");
console.log(`  groupId: ${GROUP_ID}`);
console.log(`  token:   ${TOKEN}`);
console.log(
  "  試す: curl -H 'Authorization: Bearer <AGENT_API_TOKEN>' " +
    `'http://127.0.0.1:8787/agent/shifts?name=${encodeURIComponent("開発用ユーザー")}'`,
);
console.log(
  `  カレンダーフィード(ICS_FEED_ENABLED=true のときだけ): curl http://127.0.0.1:8787/feed/${GROUP_ID}/${TOKEN}.ics`,
);
process.exit(0);
