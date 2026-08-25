import { collection, onSnapshot, orderBy, query, updateDoc, doc } from "firebase/firestore";
import { db } from "./config";
import { normalizeMemberAttributes, type Member, type MemberRole } from "../types";

const COLOR_PALETTE = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

export function colorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function nameFromEmail(email: string): string {
  return email.split("@")[0];
}

export function subscribeToMembers(
  groupId: string,
  callback: (members: Member[]) => void,
) {
  const membersCollection = collection(db, "groups", groupId, "members");
  const q = query(membersCollection, orderBy("displayName"));
  return onSnapshot(
    q,
    (snapshot) => {
      const members = snapshot.docs.map((doc) => {
        const data = doc.data() as Omit<Member, "id">;
        return {
          id: doc.id,
          ...data,
          attributes: normalizeMemberAttributes(data.attributes),
        };
      });
      callback(members);
    },
    () => {
      callback([]);
    },
  );
}

export async function updateMemberRole(
  groupId: string,
  memberId: string,
  role: MemberRole,
): Promise<void> {
  const memberRef = doc(db, "groups", groupId, "members", memberId);
  await updateDoc(memberRef, { role });
}

export async function updateMemberActive(
  groupId: string,
  memberId: string,
  active: boolean,
): Promise<void> {
  const memberRef = doc(db, "groups", groupId, "members", memberId);
  await updateDoc(memberRef, { active });
}

export async function updateMemberDisplayName(
  groupId: string,
  memberId: string,
  displayName: string,
): Promise<void> {
  const memberRef = doc(db, "groups", groupId, "members", memberId);
  await updateDoc(memberRef, { displayName });
}

export async function updateMemberAttributes(
  groupId: string,
  memberId: string,
  attributes: string[],
): Promise<void> {
  const memberRef = doc(db, "groups", groupId, "members", memberId);
  await updateDoc(memberRef, { attributes: normalizeMemberAttributes(attributes) });
}
