import { collection, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "./config";
import type { Member } from "../types";

const membersCollection = collection(db, "members");

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

function colorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function nameFromEmail(email: string): string {
  return email.split("@")[0];
}

export function subscribeToMembers(callback: (members: Member[]) => void) {
  const q = query(membersCollection, orderBy("name"));
  return onSnapshot(
    q,
    (snapshot) => {
      const members = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Member, "id">),
      }));
      callback(members);
    },
    () => {
      // Not signed in yet, or signed in but not a team member: Firestore
      // rules reject the list query. Treat that as "no members visible yet"
      // instead of leaving callers stuck on a loading state forever.
      callback([]);
    },
  );
}

/**
 * Self-service "join the team" step: called after the user has a Firebase Auth
 * account but no matching members doc yet. Firestore rules only allow this
 * write to succeed when inviteCode matches the value in config/settings.
 */
export async function createMemberProfile(params: {
  email: string;
  inviteCode: string;
}) {
  const email = params.email.toLowerCase();
  const ref = doc(membersCollection, email);
  await setDoc(ref, {
    name: nameFromEmail(email),
    email,
    color: colorForEmail(email),
    inviteCode: params.inviteCode.trim(),
  });
}
