import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";
import type { Group } from "../types";
import { colorForEmail, nameFromEmail } from "./members";

export async function createGroup(params: {
  name: string;
  ownerUid: string;
  ownerEmail: string;
  inviteCode: string;
}): Promise<string> {
  const { name, ownerUid, ownerEmail, inviteCode } = params;

  // Firestoreのセキュリティルールは、同じバッチ内の他の書き込みを get() で参照できない。
  // ルールは常にバッチ適用前の状態に対して評価される。
  // settings と members の create は isGroupOwner(gid) に依存しているため、
  // グループ本体と同じバッチで書くと group がまだ存在せず必ず拒否される。
  // したがって以下の順で逐次的に setDoc で書き込みを行う。

  const groupsRef = collection(db, "groups");
  const newGroupDocRef = doc(groupsRef);
  const groupId = newGroupDocRef.id;

  // 1. グループ本体を作成
  await setDoc(newGroupDocRef, {
    name,
    ownerId: ownerUid,
    createdAt: serverTimestamp(),
  });

  // 2. 招待コード設定を作成
  const settingsRef = doc(db, "groups", groupId, "settings", "general");
  await setDoc(settingsRef, { inviteCode });

  // 3. オーナーメンバーを作成
  const memberRef = doc(db, "groups", groupId, "members", ownerUid);
  await setDoc(memberRef, {
    email: ownerEmail,
    displayName: nameFromEmail(ownerEmail),
    color: colorForEmail(ownerEmail),
    role: "admin",
    active: true,
    joinedAt: serverTimestamp(),
  });

  // 4. ユーザードキュメントを更新（グループIDを追加）
  const userRef = doc(db, "users", ownerUid);
  await setDoc(userRef, { groupIds: arrayUnion(groupId) }, { merge: true });

  return groupId;
}

export async function joinGroup(params: {
  groupId: string;
  uid: string;
  email: string;
  inviteCode: string;
}): Promise<void> {
  const { groupId, uid, email, inviteCode } = params;
  const batch = writeBatch(db);

  const memberRef = doc(db, "groups", groupId, "members", uid);
  batch.set(memberRef, {
    email,
    displayName: nameFromEmail(email),
    color: colorForEmail(email),
    role: "member",
    active: true,
    joinedAt: serverTimestamp(),
    // セキュリティルール側で settings/general.inviteCode と突き合わせるため、
    // 書き込むドキュメントに載せる必要がある（旧 createMemberProfile と同じ方式）。
    inviteCode: inviteCode.trim(),
  });

  const userRef = doc(db, "users", uid);
  batch.set(userRef, { groupIds: arrayUnion(groupId) }, { merge: true });

  await batch.commit();
}

export function subscribeToMyGroupIds(
  uid: string,
  cb: (ids: string[]) => void,
): () => void {
  const userRef = doc(db, "users", uid);
  return onSnapshot(
    userRef,
    // includeMetadataChanges が必要。サーバが書き込みを確定しても中身は
    // ローカル反映時と同じなので、既定ではスナップショットが再発火せず、
    // hasPendingWrites が false になった瞬間を受け取れない。
    { includeMetadataChanges: true },
    (snapshot) => {
      // 未確定のローカル書き込みは無視する。joinGroup のバッチは楽観的に
      // ローカルへ先に反映されるため、これを拾うと「参加に失敗したのに一瞬
      // 参加済みとして扱われ、直後にロールバックされる」ちらつきが起きて、
      // 参加フォームがアンマウントされエラー表示が消えてしまう。
      if (snapshot.metadata.hasPendingWrites) return;
      const groupIds = (snapshot.data()?.groupIds as string[]) ?? [];
      cb(groupIds);
    },
    () => {
      cb([]);
    },
  );
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const ref = doc(db, "groups", groupId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const toMillis = (value: unknown) =>
    value ? (value as { toMillis(): number }).toMillis() : null;
  return {
    id: snapshot.id,
    name: data.name as string,
    ownerId: data.ownerId as string,
    createdAt: toMillis(data.createdAt),
  };
}
