import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, type Firestore } from "firebase/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));

const GID = "g1";
const OTHER_GID = "g2";
const INVITE = "Test123";

const ADMIN = "admin1";
const LEADER = "leader1";
const MEMBER = "member1";
const MEMBER2 = "member2";
const INACTIVE = "inactive1";
const OUTSIDER = "outsider";

let env: RulesTestEnvironment;

/** 認証済みユーザーとしての Firestore ハンドル */
const as = (uid: string): Firestore =>
  env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const memberDoc = (uid: string, role: string, active = true) => ({
  email: `${uid}@example.com`,
  displayName: uid,
  color: "#248DD4",
  role,
  active,
  attributes: [],
  joinedAt: new Date(),
});

const shiftDoc = (memberId: string, status: "desired" | "confirmed") => ({
  memberId,
  date: "2026-09-01",
  status,
  type: "出勤",
  startTime: null,
  endTime: null,
  createdBy: memberId,
  createdAt: new Date(),
  confirmedBy: null,
  confirmedAt: null,
  updatedAt: new Date(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "copia-shift-rules-test",
    firestore: {
      rules: readFileSync(join(HERE, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // シードはルールを無効化して投入する（ルール経由だと参加フローに依存してしまうため）
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "groups", GID), {
      name: "テストグループ",
      ownerId: ADMIN,
      createdAt: new Date(),
    });
    await setDoc(doc(db, "groups", GID, "settings", "general"), { inviteCode: INVITE });
    await setDoc(doc(db, "groups", GID, "members", ADMIN), memberDoc(ADMIN, "admin"));
    await setDoc(doc(db, "groups", GID, "members", LEADER), memberDoc(LEADER, "leader"));
    await setDoc(doc(db, "groups", GID, "members", MEMBER), memberDoc(MEMBER, "member"));
    await setDoc(doc(db, "groups", GID, "members", MEMBER2), memberDoc(MEMBER2, "member"));
    await setDoc(doc(db, "groups", GID, "members", INACTIVE), memberDoc(INACTIVE, "member", false));
    // 既存シフト: member1 の未確定と確定を1件ずつ
    await setDoc(doc(db, "groups", GID, "shifts", "s_pending"), shiftDoc(MEMBER, "desired"));
    await setDoc(doc(db, "groups", GID, "shifts", "s_fixed"), shiftDoc(MEMBER, "confirmed"));
    // 別グループ（分離の確認用）
    await setDoc(doc(db, "groups", OTHER_GID), {
      name: "別グループ",
      ownerId: OUTSIDER,
      createdAt: new Date(),
    });
    await setDoc(doc(db, "groups", OTHER_GID, "shifts", "s_other"), shiftDoc(OUTSIDER, "desired"));
  });
});

describe("読み取り", () => {
  it("未ログインはシフトを読めない", async () => {
    await assertFails(getDoc(doc(anon(), "groups", GID, "shifts", "s_pending")));
  });

  it("非メンバーは他グループのシフトを読めない", async () => {
    await assertFails(getDoc(doc(as(OUTSIDER), "groups", GID, "shifts", "s_pending")));
  });

  it("メンバーは同じグループのシフトを読める", async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), "groups", GID, "shifts", "s_pending")));
  });

  it("退会済み(active:false)はシフトを読めない", async () => {
    await assertFails(getDoc(doc(as(INACTIVE), "groups", GID, "shifts", "s_pending")));
  });

  it("メンバーでも別グループのシフトは読めない", async () => {
    await assertFails(getDoc(doc(as(MEMBER), "groups", OTHER_GID, "shifts", "s_other")));
  });
});

describe("希望の登録", () => {
  it("メンバーは自分の希望を作れる", async () => {
    await assertSucceeds(
      setDoc(doc(as(MEMBER), "groups", GID, "shifts", "new1"), shiftDoc(MEMBER, "desired")),
    );
  });

  it("メンバーは他人の希望を代理で作れない", async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), "groups", GID, "shifts", "new2"), shiftDoc(MEMBER2, "desired")),
    );
  });

  it("管理者は他人の希望を代理で作れる", async () => {
    await assertSucceeds(
      setDoc(doc(as(ADMIN), "groups", GID, "shifts", "new3"), shiftDoc(MEMBER2, "desired")),
    );
  });

  it("いきなり確定済みとして作ることはできない", async () => {
    await assertFails(
      setDoc(doc(as(ADMIN), "groups", GID, "shifts", "new4"), shiftDoc(ADMIN, "confirmed")),
    );
  });
});

describe("確定の権限", () => {
  const confirm = { status: "confirmed", confirmedBy: LEADER, confirmedAt: new Date() };

  it("一般メンバーは自分の希望すら確定できない", async () => {
    await assertFails(updateDoc(doc(as(MEMBER), "groups", GID, "shifts", "s_pending"), confirm));
  });

  it("リーダーは他人の希望を確定できる", async () => {
    await assertSucceeds(updateDoc(doc(as(LEADER), "groups", GID, "shifts", "s_pending"), confirm));
  });

  it("管理者は他人の希望を確定できる", async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), "groups", GID, "shifts", "s_pending"), confirm));
  });

  it("リーダーは確定を取り消せる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(LEADER), "groups", GID, "shifts", "s_fixed"), {
        status: "desired",
        confirmedBy: null,
        confirmedAt: null,
      }),
    );
  });
});

describe("シフトの編集と削除", () => {
  it("誰も memberId を書き換えられない（リーダーでも不可）", async () => {
    await assertFails(
      updateDoc(doc(as(LEADER), "groups", GID, "shifts", "s_pending"), { memberId: MEMBER2 }),
    );
  });

  it("誰も date を書き換えられない", async () => {
    await assertFails(
      updateDoc(doc(as(LEADER), "groups", GID, "shifts", "s_pending"), { date: "2026-09-02" }),
    );
  });

  it("メンバーは自分の未確定シフトの種別を変えられる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), "groups", GID, "shifts", "s_pending"), { type: "リモート" }),
    );
  });

  it("メンバーは自分の確定済みシフトを編集できない", async () => {
    await assertFails(
      updateDoc(doc(as(MEMBER), "groups", GID, "shifts", "s_fixed"), { type: "リモート" }),
    );
  });

  it("メンバーは自分の確定済みシフトを削除できない", async () => {
    await assertFails(deleteDoc(doc(as(MEMBER), "groups", GID, "shifts", "s_fixed")));
  });

  it("メンバーは自分の未確定シフトを削除できる", async () => {
    await assertSucceeds(deleteDoc(doc(as(MEMBER), "groups", GID, "shifts", "s_pending")));
  });

  it("メンバーは他人の未確定シフトを削除できない", async () => {
    await assertFails(deleteDoc(doc(as(MEMBER2), "groups", GID, "shifts", "s_pending")));
  });

  it("リーダーは他人の未確定シフトを却下（削除）できる", async () => {
    await assertSucceeds(deleteDoc(doc(as(LEADER), "groups", GID, "shifts", "s_pending")));
  });
});

describe("グループ設定", () => {
  it("一般メンバーは設定を変更できない", async () => {
    await assertFails(
      updateDoc(doc(as(MEMBER), "groups", GID, "settings", "general"), { inviteCode: "hacked" }),
    );
  });

  it("リーダーも設定を変更できない", async () => {
    await assertFails(
      updateDoc(doc(as(LEADER), "groups", GID, "settings", "general"), { inviteCode: "hacked" }),
    );
  });

  it("管理者は設定を変更できる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), "groups", GID, "settings", "general"), { inviteCode: "NewCode" }),
    );
  });

  it("非メンバーは招待コードを読めない", async () => {
    await assertFails(getDoc(doc(as(OUTSIDER), "groups", GID, "settings", "general")));
  });
});

describe("メンバー管理", () => {
  it("管理者は自分自身のロールを変更できない（最後の管理者の保護）", async () => {
    await assertFails(
      updateDoc(doc(as(ADMIN), "groups", GID, "members", ADMIN), { role: "member" }),
    );
  });

  it("管理者は他人をリーダーに昇格できる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), "groups", GID, "members", MEMBER), { role: "leader" }),
    );
  });

  it("管理者は他人を無効化できる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), "groups", GID, "members", MEMBER), { active: false }),
    );
  });

  it("管理者はメンバーの属性タグを変更できる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), "groups", GID, "members", MEMBER), {
        attributes: ["1班", "2026夏インターン"],
      }),
    );
  });

  it("一般メンバーは自分の表示名を変えられる", async () => {
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), "groups", GID, "members", MEMBER), { displayName: "新しい名前" }),
    );
  });

  it("一般メンバーは自分を管理者に昇格できない", async () => {
    await assertFails(
      updateDoc(doc(as(MEMBER), "groups", GID, "members", MEMBER), { role: "admin" }),
    );
  });

  it("一般メンバーは自分の属性タグを変更できない", async () => {
    await assertFails(
      updateDoc(doc(as(MEMBER), "groups", GID, "members", MEMBER), {
        attributes: ["管理者班"],
      }),
    );
  });

  it("一般メンバーは他人の表示名を変えられない", async () => {
    await assertFails(
      updateDoc(doc(as(MEMBER), "groups", GID, "members", MEMBER2), { displayName: "改ざん" }),
    );
  });

  it("メンバーは削除できない（退会は active:false で表す）", async () => {
    await assertFails(deleteDoc(doc(as(ADMIN), "groups", GID, "members", MEMBER)));
  });
});

describe("グループへの参加", () => {
  it("招待コードが一致すればメンバーとして参加できる", async () => {
    await assertSucceeds(
      setDoc(doc(as(OUTSIDER), "groups", GID, "members", OUTSIDER), {
        ...memberDoc(OUTSIDER, "member"),
        inviteCode: INVITE,
      }),
    );
  });

  it("招待コードの大文字小文字は区別しない", async () => {
    await assertSucceeds(
      setDoc(doc(as(OUTSIDER), "groups", GID, "members", OUTSIDER), {
        ...memberDoc(OUTSIDER, "member"),
        inviteCode: INVITE.toUpperCase(),
      }),
    );
  });

  it("招待コードが違えば参加できない", async () => {
    await assertFails(
      setDoc(doc(as(OUTSIDER), "groups", GID, "members", OUTSIDER), {
        ...memberDoc(OUTSIDER, "member"),
        inviteCode: "wrong",
      }),
    );
  });

  it("招待コードが合っていても自分を管理者にはできない", async () => {
    await assertFails(
      setDoc(doc(as(OUTSIDER), "groups", GID, "members", OUTSIDER), {
        ...memberDoc(OUTSIDER, "admin"),
        inviteCode: INVITE,
      }),
    );
  });

  it("他人のメンバードキュメントは作れない", async () => {
    await assertFails(
      setDoc(doc(as(OUTSIDER), "groups", GID, "members", MEMBER2), {
        ...memberDoc(MEMBER2, "member"),
        inviteCode: INVITE,
      }),
    );
  });
});

describe("グループ作成", () => {
  it("ログイン済みなら自分をオーナーとしてグループを作れる", async () => {
    await assertSucceeds(
      setDoc(doc(as(OUTSIDER), "groups", "newgroup"), {
        name: "新グループ",
        ownerId: OUTSIDER,
        createdAt: new Date(),
      }),
    );
  });

  it("他人をオーナーにしたグループは作れない", async () => {
    await assertFails(
      setDoc(doc(as(OUTSIDER), "groups", "newgroup2"), {
        name: "なりすまし",
        ownerId: ADMIN,
        createdAt: new Date(),
      }),
    );
  });

  it("オーナーは作成直後（メンバー未登録）でも設定を作れる", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, "groups", "g3"), {
        name: "作りかけ",
        ownerId: OUTSIDER,
        createdAt: new Date(),
      });
    });
    await assertSucceeds(
      setDoc(doc(as(OUTSIDER), "groups", "g3", "settings", "general"), { inviteCode: "abc" }),
    );
  });

  it("オーナーは作成直後に自分を管理者として登録できる", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, "groups", "g4"), {
        name: "作りかけ",
        ownerId: OUTSIDER,
        createdAt: new Date(),
      });
    });
    await assertSucceeds(
      setDoc(doc(as(OUTSIDER), "groups", "g4", "members", OUTSIDER), memberDoc(OUTSIDER, "admin")),
    );
  });
});

describe("共有リンク(shareLinks)", () => {
  const shareLink = (memberId: string) => ({
    memberId,
    statuses: ["confirmed"],
    typeKeys: ["出勤"],
    createdAt: new Date(),
  });

  it("本人はカレンダー購読リンクを発行できる", async () => {
    await assertSucceeds(
      setDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok1"), shareLink(MEMBER)),
    );
  });

  it("他人になりすましてリンクを発行することはできない", async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok2"), shareLink(MEMBER2)),
    );
  });

  it("statuses が空だと発行できない", async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok3"), {
        ...shareLink(MEMBER),
        statuses: [],
      }),
    );
  });

  it("statuses に想定外の値が入っていると発行できない", async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok4"), {
        ...shareLink(MEMBER),
        statuses: ["confirmed", "rejected"],
      }),
    );
  });

  it("typeKeys が空だと発行できない", async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok5"), {
        ...shareLink(MEMBER),
        typeKeys: [],
      }),
    );
  });

  it("本人は自分のリンクを読める", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok6"),
        shareLink(MEMBER),
      );
    });
    await assertSucceeds(getDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok6")));
  });

  it("他人のリンクは読めない(トークンを知らない限り推測もできない)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok7"),
        shareLink(MEMBER),
      );
    });
    await assertFails(getDoc(doc(as(MEMBER2), "groups", GID, "shareLinks", "tok7")));
  });

  it("管理者は他人のリンクも読める(一覧・失効のため)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok8"),
        shareLink(MEMBER),
      );
    });
    await assertSucceeds(getDoc(doc(as(ADMIN), "groups", GID, "shareLinks", "tok8")));
  });

  it("本人は自分のリンクを失効(削除)できる", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok9"),
        shareLink(MEMBER),
      );
    });
    await assertSucceeds(deleteDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok9")));
  });

  it("他人のリンクを削除できない", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok10"),
        shareLink(MEMBER),
      );
    });
    await assertFails(deleteDoc(doc(as(MEMBER2), "groups", GID, "shareLinks", "tok10")));
  });

  it("管理者は漏洩時などに他人のリンクを代理で失効できる", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok10b"),
        shareLink(MEMBER),
      );
    });
    await assertSucceeds(deleteDoc(doc(as(ADMIN), "groups", GID, "shareLinks", "tok10b")));
  });

  it("発行後に内容を書き換えることはできない(取り消して発行し直す運用)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "groups", GID, "shareLinks", "tok11"),
        shareLink(MEMBER),
      );
    });
    await assertFails(
      updateDoc(doc(as(MEMBER), "groups", GID, "shareLinks", "tok11"), { typeKeys: ["リモート"] }),
    );
  });
});

describe("所属グループの逆引き(users)", () => {
  it("自分のドキュメントは読み書きできる", async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), "users", MEMBER), { groupIds: [GID] }));
    await assertSucceeds(getDoc(doc(as(MEMBER), "users", MEMBER)));
  });

  it("他人のドキュメントは読めない", async () => {
    await assertFails(getDoc(doc(as(MEMBER), "users", MEMBER2)));
  });

  it("他人のドキュメントは書けない", async () => {
    await assertFails(setDoc(doc(as(MEMBER), "users", MEMBER2), { groupIds: [GID] }));
  });

  it("groupIds 以外のフィールドは持たせられない", async () => {
    await assertFails(setDoc(doc(as(MEMBER), "users", MEMBER), { groupIds: [GID], isAdmin: true }));
  });
});
