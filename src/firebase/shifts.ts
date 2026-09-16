import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./config";
import type { Shift, ShiftType } from "../types";
import type { ShiftAction } from "../components/shiftOps";

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
  onError?: (error: unknown) => void,
): () => void {
  const shiftsCollection = collection(db, "groups", groupId, "shifts");
  const q = query(
    shiftsCollection,
    where("date", ">=", startDate),
    where("date", "<=", endDate),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const shifts = snapshot.docs.map((d) => toShift(d.id, d.data()));
      cb(shifts);
    },
    // 読み込み失敗を握り潰すと、権限エラーや通信断が「予定が1件も無い」
    // 画面と区別できなくなる。呼び出し側へ必ず渡す。
    (error) => onError?.(error),
  );
}

/**
 * Firestore の書き込みバッチ上限は500件。serverTimestamp などの余裕を見て
 * 手前で区切る。ここを超える操作は複数回に分かれ、原子的ではなくなる。
 */
export const MAX_ATOMIC_ACTIONS = 450;

/**
 * 分割して書いている途中で失敗したときに投げる。どこまで書けたかを持たせないと、
 * 「0件失敗」と表示しながら実際には一部が保存済み、という食い違いが起きる。
 */
export class ShiftWriteError extends Error {
  readonly written: number;
  readonly reason: unknown;

  constructor(written: number, reason: unknown) {
    super("shift write failed");
    this.name = "ShiftWriteError";
    this.written = written;
    this.reason = reason;
  }
}

export interface ApplyActionsResult {
  written: number;
  /** 1回のバッチで書けたか。false なら途中まで反映される可能性がある */
  atomic: boolean;
}

/**
 * 計画済みの操作をまとめて書き込む。上限内なら1回のバッチ＝全部成功か全部失敗。
 * 上限を超える場合だけ分割し、原子的でなかったことを戻り値で伝える。
 */
export async function applyShiftActions(
  groupId: string,
  uid: string,
  actions: ShiftAction[],
): Promise<ApplyActionsResult> {
  if (actions.length === 0) return { written: 0, atomic: true };

  const shiftsCollection = collection(db, "groups", groupId, "shifts");
  const chunks: ShiftAction[][] = [];
  for (let i = 0; i < actions.length; i += MAX_ATOMIC_ACTIONS) {
    chunks.push(actions.slice(i, i + MAX_ATOMIC_ACTIONS));
  }

  let written = 0;
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const action of chunk) {
      if (action.kind === "create") {
        batch.set(doc(shiftsCollection), {
          memberId: action.memberId,
          date: action.date,
          status: "desired",
          type: action.type,
          startTime: action.startTime,
          endTime: action.endTime,
          createdBy: uid,
          createdAt: serverTimestamp(),
          confirmedBy: null,
          confirmedAt: null,
          updatedAt: serverTimestamp(),
        });
      } else if (action.kind === "update") {
        batch.update(doc(db, "groups", groupId, "shifts", action.shiftId), {
          ...action.updates,
          updatedAt: serverTimestamp(),
        });
      } else if (action.kind === "delete") {
        batch.delete(doc(db, "groups", groupId, "shifts", action.shiftId));
      } else if (action.kind === "confirm") {
        batch.update(doc(db, "groups", groupId, "shifts", action.shiftId), {
          status: "confirmed",
          confirmedBy: uid,
          confirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (action.kind === "revert") {
        batch.update(doc(db, "groups", groupId, "shifts", action.shiftId), {
          status: "desired",
          confirmedBy: null,
          confirmedAt: null,
          updatedAt: serverTimestamp(),
        });
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      throw new ShiftWriteError(written, err);
    }
    written += chunk.length;
  }

  return { written, atomic: chunks.length === 1 };
}
