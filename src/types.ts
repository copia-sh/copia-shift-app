export type ShiftType = "出勤" | "リモート" | "欠勤" | "未定";

export type ShiftStatus = "desired" | "confirmed";

export interface Member {
  /** Firestore doc ID for this member, which is the member's Google account email (lowercased). */
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface ShiftEntry {
  id: string;
  memberId: string;
  date: string; // "YYYY-MM-DD"
  status: ShiftStatus;
  type: ShiftType;
  startTime: string | null; // "HH:mm"
  endTime: string | null;
  createdBy: string;
  createdAt: number | null;
  confirmedBy: string | null;
  confirmedAt: number | null;
  updatedAt: number | null;
}

export const SHIFT_TYPES: ShiftType[] = ["出勤", "リモート", "欠勤", "未定"];

export const SHIFT_TYPE_STYLE: Record<
  ShiftType,
  { bg: string; text: string; label: string }
> = {
  出勤: { bg: "#22c55e", text: "#ffffff", label: "出勤" },
  リモート: { bg: "#3b82f6", text: "#ffffff", label: "リモート" },
  欠勤: { bg: "#9ca3af", text: "#ffffff", label: "欠勤" },
  未定: { bg: "#ffffff", text: "#6b7280", label: "未定" },
};
