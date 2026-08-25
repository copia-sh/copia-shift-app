#!/usr/bin/env node
/**
 * 旧スキーマ（単一チーム）から新スキーマ（グループ配下）へのデータ移行。
 *
 *   旧: members/{email}                    新: groups/{gid}/members/{uid}
 *       shiftEntries/{email}_{date}            groups/{gid}/shifts/{uid}_{date}
 *       config/settings                        groups/{gid}/settings/general
 *                                              groups/{gid}/settings/shiftTypes
 *                                              users/{uid}.groupIds
 *
 * 既定はドライラン（何も書き込まない）。実際に書くには --apply を付ける。
 * 旧コレクションは削除しない。動作確認が済んでからコンソールで手動削除すること。
 *
 * 使い方:
 *   node scripts/migrate.mjs --key ./serviceAccount.json --admin you@example.com --name "チーム名"
 *   node scripts/migrate.mjs --key ./serviceAccount.json --admin you@example.com --name "チーム名" --apply
 *   node scripts/migrate.mjs --key ./serviceAccount.json --verify --group-id <既存のgroupId>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

/* ------------------------------------------------------------------ 引数 */

function parseArgs(argv) {
  const out = { apply: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--verify") out.verify = true;
    else if (a === "--key") out.key = argv[++i];
    else if (a === "--project") out.project = argv[++i];
    else if (a === "--admin") out.admin = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--group-id") out.groupId = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// エミュレータに向いているときは実際の鍵が要らない（練習用）。
const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (args.help || (!args.key && !useEmulator)) {
  console.log(`
移行スクリプト

  --key <path>        サービスアカウント鍵のJSONへのパス（本番では必須）
  --project <id>      プロジェクトID（エミュレータで練習するときに指定）
  --admin <email>     管理者にするメンバーのメールアドレス（--verify 以外で必須）
  --name <text>       作成するグループ名（既定: "チーム"）
  --group-id <id>     既存グループに追記する場合に指定（省略時は新規作成）
  --apply             実際に書き込む（省略時はドライラン）
  --verify            移行結果の件数だけ突き合わせる

本番:
  node scripts/migrate.mjs --key ./serviceAccount.json --admin you@example.com --name "チーム名"
  node scripts/migrate.mjs --key ./serviceAccount.json --admin you@example.com --name "チーム名" --apply

エミュレータで練習（鍵は不要）:
  export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
  node scripts/migrate.mjs --project demo-x --admin you@example.com --name "練習" --apply
`);
  process.exit(args.help ? 0 : 1);
}

/* ------------------------------------------------------------- 初期化 */

let projectId;
if (useEmulator && !args.key) {
  projectId = args.project ?? process.env.GCLOUD_PROJECT;
  if (!projectId) {
    console.error("エミュレータで動かすには --project <projectId> を指定してください");
    process.exit(1);
  }
  initializeApp({ projectId });
} else {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(args.key, "utf8"));
  } catch (e) {
    console.error(`サービスアカウント鍵を読めませんでした: ${args.key}\n${e.message}`);
    process.exit(1);
  }
  projectId = serviceAccount.project_id;
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();
console.log(`プロジェクト: ${projectId}${useEmulator ? "（エミュレータ）" : ""}`);
console.log(args.apply ? "モード: 実行（書き込みます）" : "モード: ドライラン（書き込みません）");
console.log("");

/* ---------------------------------------------------- 既定のシフト種別 */

const DEFAULT_SHIFT_TYPES = [
  { key: "出勤", label: "出勤", color: "#248DD4", attendance: "available", mark: "○" },
  { key: "リモート", label: "リモート", color: "#1F8A98", attendance: "available", mark: "R" },
  { key: "欠勤", label: "欠勤", color: "#D9736F", attendance: "unavailable", mark: "×" },
];

const DEFAULT_GENERAL = {
  displayStartHour: 9,
  displayEndHour: 20,
  weekStartsOn: 0,
  maxSegmentsPerDay: 4,
};

/* ------------------------------------------------------------ 読み取り */

async function readOldData() {
  const [membersSnap, shiftsSnap, configSnap] = await Promise.all([
    db.collection("members").get(),
    db.collection("shiftEntries").get(),
    db.collection("config").doc("settings").get(),
  ]);
  return {
    members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    shifts: shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    inviteCode: configSnap.exists ? (configSnap.data().inviteCode ?? "") : "",
  };
}

/** Auth の全ユーザーから email(小文字) -> uid のマップを作る */
async function buildEmailToUid() {
  const map = new Map();
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.email) map.set(u.email.toLowerCase(), u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return map;
}

/* ------------------------------------------------------------ 検証のみ */

async function verify(groupId) {
  const old = await readOldData();
  const [newMembers, newShifts] = await Promise.all([
    db.collection("groups").doc(groupId).collection("members").get(),
    db.collection("groups").doc(groupId).collection("shifts").get(),
  ]);
  const rows = [
    ["メンバー", old.members.length, newMembers.size],
    ["シフト", old.shifts.length, newShifts.size],
  ];
  console.log("項目        旧    新    判定");
  let ok = true;
  for (const [label, a, b] of rows) {
    const same = a === b;
    if (!same) ok = false;
    console.log(`${label.padEnd(10)}${String(a).padStart(4)}${String(b).padStart(6)}    ${same ? "一致" : "不一致"}`);
  }
  console.log("");
  console.log(ok ? "件数は一致しています。" : "件数が一致していません。移行が途中で失敗した可能性があります。");
  process.exit(ok ? 0 : 1);
}

/* -------------------------------------------------------------- 本処理 */

async function main() {
  if (args.verify) {
    if (!args.groupId) {
      console.error("--verify には --group-id が必要です");
      process.exit(1);
    }
    return verify(args.groupId);
  }

  if (!args.admin) {
    console.error("--admin <email> を指定してください（管理者にする人）");
    process.exit(1);
  }

  const old = await readOldData();
  console.log(`旧データ: メンバー ${old.members.length}件 / シフト ${old.shifts.length}件`);
  if (old.members.length === 0) {
    console.error("members が空です。移行対象がありません。");
    process.exit(1);
  }

  const emailToUid = await buildEmailToUid();
  console.log(`Authのユーザー: ${emailToUid.size}件`);
  console.log("");

  // --- メンバーの対応付け
  const adminEmail = args.admin.toLowerCase();
  const memberPlans = [];
  const problems = [];

  for (const m of old.members) {
    const email = (m.email ?? m.id ?? "").toLowerCase();
    const uid = emailToUid.get(email);
    if (!uid) {
      problems.push(`メンバー ${email} に対応するAuthユーザーが見つかりません（スキップします）`);
      continue;
    }
    memberPlans.push({
      uid,
      email,
      displayName: m.name ?? email.split("@")[0],
      color: m.color ?? "#248DD4",
      role: email === adminEmail ? "admin" : "member",
      active: true,
      attributes: [],
    });
  }

  if (!memberPlans.some((m) => m.role === "admin")) {
    console.error(`--admin に指定した ${adminEmail} が members に見つかりません。`);
    console.error(`候補: ${old.members.map((m) => m.email ?? m.id).join(", ")}`);
    process.exit(1);
  }

  // --- シフトの対応付け
  const emailToPlan = new Map(memberPlans.map((m) => [m.email, m]));
  const shiftPlans = [];

  for (const s of old.shifts) {
    const email = (s.memberId ?? "").toLowerCase();
    const plan = emailToPlan.get(email);
    if (!plan) {
      problems.push(`シフト ${s.id} の持ち主 ${email} を解決できません（スキップします）`);
      continue;
    }
    if (!s.date) {
      problems.push(`シフト ${s.id} に date がありません（スキップします）`);
      continue;
    }
    shiftPlans.push({
      // uid_date の決定的なIDにする。二重実行しても増えない（上書きになる）。
      docId: `${plan.uid}_${s.date}`,
      data: {
        memberId: plan.uid,
        date: s.date,
        status: s.status === "confirmed" ? "confirmed" : "desired",
        type: s.type ?? "出勤",
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        createdBy: s.createdBy ?? plan.uid,
        createdAt: s.createdAt ?? null,
        confirmedBy: s.confirmedBy ?? null,
        confirmedAt: s.confirmedAt ?? null,
        updatedAt: s.updatedAt ?? null,
      },
    });
  }

  // --- 計画の表示
  console.log("移行計画");
  console.log(`  グループ名   : ${args.name ?? "チーム"}`);
  console.log(`  招待コード   : ${old.inviteCode ? "旧 config/settings から引き継ぎ" : "（未設定。移行後に設定画面で入れてください）"}`);
  console.log(`  メンバー     : ${memberPlans.length}件`);
  for (const m of memberPlans) {
    console.log(`      ${m.role.padEnd(6)} ${m.email}  →  ${m.uid}`);
  }
  console.log(`  シフト       : ${shiftPlans.length}件`);
  const confirmed = shiftPlans.filter((s) => s.data.status === "confirmed").length;
  console.log(`      確定 ${confirmed}件 / 希望 ${shiftPlans.length - confirmed}件`);
  console.log("");

  if (problems.length > 0) {
    console.log(`注意 (${problems.length}件):`);
    for (const p of problems.slice(0, 20)) console.log(`  - ${p}`);
    if (problems.length > 20) console.log(`  ... 他 ${problems.length - 20}件`);
    console.log("");
  }

  if (!args.apply) {
    console.log("ドライランのため、ここで終了します。");
    console.log("問題がなければ --apply を付けて再実行してください。");
    return;
  }

  // --- バックアップ（書き込み前に必ず取る）
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `./backup-${projectId}-${stamp}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify({ takenAt: stamp, projectId, ...old }, null, 2),
    "utf8",
  );
  console.log(`バックアップを保存しました: ${backupPath}`);

  // --- 書き込み
  const groupRef = args.groupId
    ? db.collection("groups").doc(args.groupId)
    : db.collection("groups").doc();
  const groupId = groupRef.id;
  const adminPlan = memberPlans.find((m) => m.role === "admin");

  await groupRef.set(
    {
      name: args.name ?? "チーム",
      ownerId: adminPlan.uid,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await groupRef.collection("settings").doc("general").set(
    { inviteCode: old.inviteCode ?? "", ...DEFAULT_GENERAL },
    { merge: true },
  );
  await groupRef.collection("settings").doc("shiftTypes").set({ types: DEFAULT_SHIFT_TYPES });

  // Firestore のバッチは1回500操作まで
  async function commitInChunks(items, write) {
    let done = 0;
    for (let i = 0; i < items.length; i += 400) {
      const batch = db.batch();
      for (const item of items.slice(i, i + 400)) write(batch, item);
      await batch.commit();
      done += Math.min(400, items.length - i);
      process.stdout.write(`\r  書き込み ${done}/${items.length}`);
    }
    if (items.length > 0) process.stdout.write("\n");
  }

  console.log("メンバーを書き込みます");
  await commitInChunks(memberPlans, (batch, m) => {
    batch.set(
      groupRef.collection("members").doc(m.uid),
      {
        email: m.email,
        displayName: m.displayName,
        color: m.color,
        role: m.role,
        active: m.active,
        attributes: m.attributes,
        joinedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batch.set(
      db.collection("users").doc(m.uid),
      { groupIds: FieldValue.arrayUnion(groupId) },
      { merge: true },
    );
  });

  console.log("シフトを書き込みます");
  await commitInChunks(shiftPlans, (batch, s) => {
    batch.set(groupRef.collection("shifts").doc(s.docId), s.data, { merge: true });
  });

  console.log("");
  console.log("移行が完了しました。");
  console.log(`  グループID: ${groupId}`);
  console.log("");
  const target = args.key ? `--key ${args.key}` : `--project ${projectId}`;
  console.log("次の手順:");
  console.log(`  1. 件数の確認:  node scripts/migrate.mjs ${target} --verify --group-id ${groupId}`);
  console.log("  2. アプリを開いて表示を確認する");
  console.log("  3. 旧コレクション(members / shiftEntries / config)は残してあります。");
  console.log("     しばらく様子を見てから、Firebaseコンソールで手動削除してください。");
}

main().catch((e) => {
  console.error("");
  console.error("失敗しました:", e.message);
  console.error("旧データは変更していません。バックアップJSONがあれば確認してください。");
  process.exit(1);
});
