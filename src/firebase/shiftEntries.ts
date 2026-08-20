import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./config";
import type { ShiftEntry, ShiftType } from "../types";

const shiftEntriesCollection = collection(db, "shiftEntries");

function entryId(memberId: string, date: string) {
  return `${memberId}_${date}`;
}

function toEntry(id: string, data: Record<string, unknown>): ShiftEntry {
  const toMillis = (value: unknown) =>
    value ? (value as Timestamp).toMillis() : null;
  return {
    id,
    memberId: data.memberId as string,
    date: data.date as string,
    status: data.status as ShiftEntry["status"],
    type: data.type as ShiftType,
    startTime: (data.startTime as string) ?? null,
    endTime: (data.endTime as string) ?? null,
    createdBy: data.createdBy as string,
    createdAt: toMillis(data.createdAt),
    confirmedBy: (data.confirmedBy as string) ?? null,
    confirmedAt: toMillis(data.confirmedAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export function subscribeToShiftEntriesInRange(
  startDate: string,
  endDate: string,
  callback: (entries: ShiftEntry[]) => void,
) {
  const q = query(
    shiftEntriesCollection,
    where("date", ">=", startDate),
    where("date", "<=", endDate),
  );
  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((d) => toEntry(d.id, d.data()));
    callback(entries);
  });
}

/** Register (or overwrite) desired shifts for one member across multiple dates in one batch. */
export async function registerDesiredShiftsBulk(params: {
  memberId: string;
  dates: string[];
  type: ShiftType;
  startTime: string | null;
  endTime: string | null;
  uid: string;
}) {
  const { memberId, dates, type, startTime, endTime, uid } = params;
  const batch = writeBatch(db);
  for (const date of dates) {
    const ref = doc(shiftEntriesCollection, entryId(memberId, date));
    batch.set(ref, {
      memberId,
      date,
      status: "desired",
      type,
      startTime,
      endTime,
      createdBy: uid,
      createdAt: serverTimestamp(),
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Delete desired shifts for one member across multiple dates in one batch. */
export async function deleteDesiredShiftsBulk(
  memberId: string,
  dates: string[],
) {
  const batch = writeBatch(db);
  for (const date of dates) {
    const ref = doc(shiftEntriesCollection, entryId(memberId, date));
    batch.delete(ref);
  }
  await batch.commit();
}

/** Confirm a desired shift into a confirmed one. Any team member may call this for anyone. */
export async function confirmShiftEntry(entryDocId: string, uid: string) {
  const ref = doc(shiftEntriesCollection, entryDocId);
  await updateDoc(ref, {
    status: "confirmed",
    confirmedBy: uid,
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Confirm multiple desired shifts (any member's) in one batch. */
export async function confirmShiftEntriesBulk(entryDocIds: string[], uid: string) {
  const batch = writeBatch(db);
  for (const id of entryDocIds) {
    batch.update(doc(shiftEntriesCollection, id), {
      status: "confirmed",
      confirmedBy: uid,
      confirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Reject/cancel multiple pending (desired) shifts (any member's) in one batch. */
export async function deleteShiftEntriesBulk(entryDocIds: string[]) {
  const batch = writeBatch(db);
  for (const id of entryDocIds) {
    batch.delete(doc(shiftEntriesCollection, id));
  }
  await batch.commit();
}

/** Revert a confirmed shift back to desired. Any team member may call this for anyone. */
export async function revertShiftEntryToDesired(entryDocId: string) {
  const ref = doc(shiftEntriesCollection, entryDocId);
  await updateDoc(ref, {
    status: "desired",
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: serverTimestamp(),
  });
}

/** Update the type/time of an existing entry (used from the week view time editor). */
export async function updateShiftEntryDetails(
  entryDocId: string,
  updates: { type?: ShiftType; startTime?: string | null; endTime?: string | null },
) {
  const ref = doc(shiftEntriesCollection, entryDocId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

export async function getShiftEntry(memberId: string, date: string) {
  const ref = doc(shiftEntriesCollection, entryId(memberId, date));
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? toEntry(snapshot.id, snapshot.data()) : null;
}

export async function deleteShiftEntry(entryDocId: string) {
  await deleteDoc(doc(shiftEntriesCollection, entryDocId));
}

export { entryId };
