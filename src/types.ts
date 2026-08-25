export type ShiftStatus = "desired" | "confirmed";
export type MemberRole = "admin" | "leader" | "member";
export type ShiftType = "出勤" | "リモート" | "欠勤" | "未定" | "却下";

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number | null;
}

export interface Member {
  id: string;
  email: string;
  displayName: string;
  color: string;
  role: MemberRole;
  active: boolean;
  joinedAt: number | null;
}

export interface Shift {
  id: string;
  memberId: string;
  date: string;
  status: ShiftStatus;
  type: ShiftType;
  startTime: string | null;
  endTime: string | null;
  createdBy: string;
  createdAt: number | null;
  confirmedBy: string | null;
  confirmedAt: number | null;
  updatedAt: number | null;
}

export interface GroupSettings {
  inviteCode: string;
  displayStartHour: number;
  displayEndHour: number;
  weekStartsOn: 0 | 1;
  maxSegmentsPerDay: number;
}

export const DEFAULT_GROUP_SETTINGS: Omit<GroupSettings, "inviteCode"> = {
  displayStartHour: 9,
  displayEndHour: 20,
  weekStartsOn: 0,
  maxSegmentsPerDay: 4,
};
