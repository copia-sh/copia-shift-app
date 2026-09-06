import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./config";
import type { ShareLink, ShiftStatus } from "../types";

function toShareLink(id: string, data: Record<string, unknown>): ShareLink {
  const toMillis = (value: unknown) => (value ? (value as Timestamp).toMillis() : null);
  return {
    id,
    memberId: data.memberId as string,
    statuses: data.statuses as ShiftStatus[],
    typeKeys: data.typeKeys as string[],
    createdAt: toMillis(data.createdAt),
  };
}

/** 自分が発行したカレンダー購読リンクを購読する。 */
export function subscribeToMyShareLinks(
  groupId: string,
  memberId: string,
  cb: (links: ShareLink[]) => void,
): () => void {
  const shareLinksCollection = collection(db, "groups", groupId, "shareLinks");
  const q = query(shareLinksCollection, where("memberId", "==", memberId));
  return onSnapshot(q, (snapshot) => {
    cb(snapshot.docs.map((d) => toShareLink(d.id, d.data())));
  });
}

export async function createShareLink(params: {
  groupId: string;
  token: string;
  memberId: string;
  statuses: ShiftStatus[];
  typeKeys: string[];
}): Promise<void> {
  const { groupId, token, memberId, statuses, typeKeys } = params;
  const ref = doc(db, "groups", groupId, "shareLinks", token);
  await setDoc(ref, {
    memberId,
    statuses,
    typeKeys,
    createdAt: serverTimestamp(),
  });
}

export async function deleteShareLink(groupId: string, token: string): Promise<void> {
  await deleteDoc(doc(db, "groups", groupId, "shareLinks", token));
}
