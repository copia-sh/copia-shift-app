import { DEFAULT_SHIFT_TYPES, REJECTED_TYPE } from "../types";
import type { Shift, ShiftType, ShiftTypeDef } from "../types";

type RejectionFields = Pick<Shift, "type" | "rejectedFromType">;

/**
 * 却下するときに控えておく元の種別。すでに却下されているものは null（対象外）。
 * 二重に却下すると、控えた元の種別が「却下」で上書きされて戻せなくなるため。
 */
export function rejectedFromTypeOf(shift: RejectionFields): ShiftType | null {
  return shift.type === REJECTED_TYPE ? null : shift.type;
}

/**
 * 却下を取り消したときに戻す種別。却下されていないものは null（対象外）。
 * 元の種別を控える前に却下されたものや、その種別が設定から消えているものは、
 * 最初の「出勤できる」種別に戻す（希望として出し直された扱い）。
 */
export function restoredTypeOf(shift: RejectionFields, types: ShiftTypeDef[]): ShiftType | null {
  if (shift.type !== REJECTED_TYPE) return null;
  const from = shift.rejectedFromType;
  if (from && from !== REJECTED_TYPE && types.some((t) => t.key === from)) return from;
  const fallback = types.find((t) => t.attendance === "available") ?? DEFAULT_SHIFT_TYPES[0];
  return fallback.key;
}
