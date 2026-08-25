import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./config";
import type { Shift, ShiftType } from "../types";

function toShift(id: string, data: Record<string, unknown>): Shift {
  const toMillis = (value: unknown) =>
    value ? (value as Timestamp).toMillis() : null;
  return {
    id,
    memberId: data.memberId as string,
    date: data.date as string,
    status: data.status as Shift["status"],
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

export function subscribeToShiftsInRange(
  groupId: string,
  startDate: string,
  endDate: string,
  cb: (shifts: Shift[]) => void,
): () => void {
  const shiftsCollection = collection(db, "groups", groupId, "shifts");
  const q = query(
    shiftsCollection,
    where("date", ">=", startDate),
    where("date", "<=", endDate),
  );
  return onSnapshot(q, (snapshot) => {
    const shifts = snapshot.docs.map((d) => toShift(d.id, d.data()));
    cb(shifts);
  });
}

export async function createShiftsBulk(params: {
  groupId: string;
  memberId: string;
  dates: string[];
  type: ShiftType;
  startTime: string | null;
  endTime: string | null;
  uid: string;
}): Promise<void> {
  const { groupId, memberId, dates, type, startTime, endTime, uid } = params;
  const shiftsCollection = collection(db, "groups", groupId, "shifts");
  const batch = writeBatch(db);

  for (const date of dates) {
    const ref = doc(shiftsCollection);
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

export async function deleteShiftsBulk(
  groupId: string,
  shiftIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  for (const id of shiftIds) {
    const ref = doc(db, "groups", groupId, "shifts", id);
    batch.delete(ref);
  }
  await batch.commit();
}

export async function confirmShift(
  groupId: string,
  shiftId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db, "groups", groupId, "shifts", shiftId);
  await updateDoc(ref, {
    status: "confirmed",
    confirmedBy: uid,
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function revertShiftToDesired(
  groupId: string,
  shiftId: string,
): Promise<void> {
  const ref = doc(db, "groups", groupId, "shifts", shiftId);
  await updateDoc(ref, {
    status: "desired",
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function updateShiftDetails(
  groupId: string,
  shiftId: string,
  updates: { type?: ShiftType; startTime?: string | null; endTime?: string | null },
): Promise<void> {
  const ref = doc(db, "groups", groupId, "shifts", shiftId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}
