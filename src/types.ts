export type ShiftType = "出勤" | "リモート" | "欠勤" | "未定" | "却下";

export type ShiftStatus = "desired" | "confirmed";

export interface Member {
  /** Firestore doc ID for this member, which is the member's login email (lowercased). */
  id: string;
  /** Auto-derived from the email's local part at signup (e.g. "yamada" from yamada@example.com). */
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
