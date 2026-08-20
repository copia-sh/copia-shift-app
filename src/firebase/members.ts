import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./config";
import type { Member } from "../types";

const membersCollection = collection(db, "members");

export function subscribeToMembers(callback: (members: Member[]) => void) {
  const q = query(membersCollection, orderBy("name"));
  return onSnapshot(q, (snapshot) => {
    const members = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Member, "id">),
    }));
    callback(members);
  });
}
