import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
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
  const batch = writeBatch(db);

  const groupsRef = collection(db, "groups");
  const newGroupDocRef = doc(groupsRef);
  const groupId = newGroupDocRef.id;

  batch.set(newGroupDocRef, {
    name,
    ownerId: ownerUid,
    createdAt: serverTimestamp(),
  });

  const settingsRef = doc(db, "groups", groupId, "settings", "general");
  batch.set(settingsRef, { inviteCode });

  const memberRef = doc(db, "groups", groupId, "members", ownerUid);
  batch.set(memberRef, {
    email: ownerEmail,
    displayName: nameFromEmail(ownerEmail),
    color: colorForEmail(ownerEmail),
    role: "admin",
    active: true,
    joinedAt: serverTimestamp(),
  });

  const userRef = doc(db, "users", ownerUid);
  const userSnap = await getDoc(userRef);
  const existingGroupIds = (userSnap.data()?.groupIds as string[]) ?? [];
  batch.update(userRef, {
    groupIds: [...existingGroupIds, groupId],
  });

  await batch.commit();
  return groupId;
}

export async function joinGroup(params: {
  groupId: string;
  uid: string;
  email: string;
  inviteCode: string;
}): Promise<void> {
  const { groupId, uid, email, inviteCode: _inviteCode } = params;
  const batch = writeBatch(db);

  const memberRef = doc(db, "groups", groupId, "members", uid);
  batch.set(memberRef, {
    email,
    displayName: nameFromEmail(email),
    color: colorForEmail(email),
    role: "member",
    active: true,
    joinedAt: serverTimestamp(),
  });

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const existingGroupIds = (userSnap.data()?.groupIds as string[]) ?? [];
  batch.update(userRef, {
    groupIds: [...existingGroupIds, groupId],
  });

  await batch.commit();
}

export function subscribeToMyGroupIds(
  uid: string,
  cb: (ids: string[]) => void,
): () => void {
  const userRef = doc(db, "users", uid);
  return onSnapshot(
    userRef,
    (snapshot) => {
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
