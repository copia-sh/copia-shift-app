export type ShiftStatus = "desired" | "confirmed";
export type MemberRole = "admin" | "leader" | "member";

/** Shift.type に入る値。既定は "出勤"/"リモート"/"欠勤"（既存データと互換）。 */
export type ShiftType = string;

/** 予約語。ユーザーが編集・削除できない。 */
export const REJECTED_TYPE = "却下";
export const UNSET_TYPE = "未定";

export interface ShiftTypeDef {
  /** Shift.type に保存される安定ID。作成後は変更しない */
  key: string;
  label: string;
  /** ベース色 #RRGGBB。淡色・濃色はここから算出する */
  color: string;
  /** その日出られるか。"unavailable" は「不可」として扱う */
  attendance: "available" | "unavailable";
  /** セル内に出す記号（1文字推奨） */
  mark: string;
}

export const DEFAULT_SHIFT_TYPES: ShiftTypeDef[] = [
  { key: "出勤", label: "出勤", color: "#248DD4", attendance: "available", mark: "○" },
  { key: "リモート", label: "リモート", color: "#1F8A98", attendance: "available", mark: "R" },
  { key: "欠勤", label: "欠勤", color: "#D9736F", attendance: "unavailable", mark: "×" },
];

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
