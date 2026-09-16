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
  /** 在籍しているか。退会は false で表す（ドキュメントは消さない） */
  active: boolean;
  /**
   * シフトを登録する人か。社員のように希望を出さない人を、在籍のまま
   * シフト表から外すために使う。既定 true（未設定の既存データも対象扱い）。
   */
  shiftTarget: boolean;
  attributes: string[];
  joinedAt: number | null;
}

export const MAX_MEMBER_ATTRIBUTES = 20;
export const MAX_MEMBER_ATTRIBUTE_LENGTH = 30;

/** 旧データや入力値を、表示・保存に使える重複なしの属性タグへ正規化する。 */
export function normalizeMemberAttributes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().slice(0, MAX_MEMBER_ATTRIBUTE_LENGTH))
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, MAX_MEMBER_ATTRIBUTES);
}

/** 未選択は全員、複数選択はどれか1つ以上の属性を持つメンバーを返す。 */
export function filterMembersByAttributes(
  members: Member[],
  selectedAttributes: ReadonlySet<string>,
): Member[] {
  if (selectedAttributes.size === 0) return members;
  return members.filter((member) =>
    member.attributes.some((attribute) => selectedAttributes.has(attribute)),
  );
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

export interface ShareLink {
  id: string;
  memberId: string;
  statuses: ShiftStatus[];
  typeKeys: string[];
  createdAt: number | null;
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

/**
 * 保存値に既定値を埋めて GroupSettings にする。
 * 未設定のときだけ既定値を使う（`??` なので 0 や false は潰れない）。
 *
 * Firestore アクセス層ではなくここに置いている: 純粋関数なので、
 * Firebase の初期化なしにテストできるようにするため。
 */
export function withDefaults(raw: Record<string, unknown> | undefined): GroupSettings {
  return {
    inviteCode: (raw?.inviteCode as string) ?? "",
    displayStartHour: (raw?.displayStartHour as number) ?? DEFAULT_GROUP_SETTINGS.displayStartHour,
    displayEndHour: (raw?.displayEndHour as number) ?? DEFAULT_GROUP_SETTINGS.displayEndHour,
    weekStartsOn: (raw?.weekStartsOn as 0 | 1) ?? DEFAULT_GROUP_SETTINGS.weekStartsOn,
    maxSegmentsPerDay: (raw?.maxSegmentsPerDay as number) ?? DEFAULT_GROUP_SETTINGS.maxSegmentsPerDay,
  };
}
