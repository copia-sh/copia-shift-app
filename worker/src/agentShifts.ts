import { DEFAULT_SHIFT_TYPES } from "../../src/types";
import type { FirestoreClient } from "./firestoreRest";
import { findActiveMemberByName } from "./memberName";
import { isValidPathSegment } from "./pathSegment";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Shift.startTime / endTime は `<input type="time">` 由来のゼロ埋め "HH:mm"。 */
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * 氏名として受け付ける最大文字数。Member.displayName にこれを超える実データは無い。
 * date や groupId と同じく、長さを明示的に上限で切ってから正規化処理に渡す。
 */
const MAX_NAME_LENGTH = 200;

/** 勤務種別が「その日出られる種別か」。定義が消えた種別は判断できないので unknown。 */
export type SegmentAttendance = "available" | "unavailable" | "unknown";

export interface AgentShiftSegment {
  /** Shift.type に保存されている安定ID */
  type: string;
  /** 表示用ラベル。種別定義が無ければ type と同じ */
  label: string;
  attendance: SegmentAttendance;
  /** "HH:mm"。両方 null は終日(時刻未設定) */
  startTime: string | null;
  endTime: string | null;
}

export interface AgentShiftsPayload {
  date: string;
  /** シフトアプリ上の表示名。呼び出し時の表記ゆれではなく、登録されている実際の氏名を返す */
  name: string;
  /** 出勤扱いの区分だけから算出した当日の勤務開始・終了。算出できなければ null */
  workStart: string | null;
  workEnd: string | null;
  segments: AgentShiftSegment[];
}

export type AgentShiftsResult =
  | { ok: true; payload: AgentShiftsPayload }
  | { ok: false; status: 400 | 404 | 409 | 500; reason: string };

/**
 * `YYYY-MM-DD` かつ暦上実在する日かを判定する。
 *
 * 正規表現だけでは `2026-02-30` や `2026-13-01` を通してしまう。Date は存在しない日を
 * 翌月へ繰り上げるので、組み立てた日付を読み直して一致するかで実在を確かめる。
 */
export function isValidDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 氏名として受け付けられる長さかどうか。ルーティング側でも早期に弾くため公開する。 */
export function isValidAgentName(value: string): boolean {
  return value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

/** "HH:mm" として読めない値は null にする。壊れた値がそのまま勤務時刻になるのを防ぐ。 */
function timeOrNull(value: unknown): string | null {
  return typeof value === "string" && TIME_OF_DAY.test(value) ? value : null;
}

interface TypeInfo {
  label: string;
  attendance: SegmentAttendance;
}

/**
 * Firestoreの生データ1件を勤務種別として読む。読めなければ null(=捨てる)。
 *
 * `doc.data` は unknown 由来なので、`ShiftTypeDef` へまとめてキャストせず1項目ずつ確かめる。
 * `attendance` が既知の2値でなければ、出勤扱いと断定せず unknown にする。
 */
function toTypeEntry(raw: unknown): [string, TypeInfo] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { key, label, attendance } = raw as Record<string, unknown>;
  if (typeof key !== "string" || key.length === 0) return null;
  return [
    key,
    {
      label: typeof label === "string" && label.length > 0 ? label : key,
      attendance:
        attendance === "available" || attendance === "unavailable" ? attendance : "unknown",
    },
  ];
}

/** グループ固有の勤務種別を読む。未設定・空なら既定の3種別(出勤/リモート/欠勤)を使う。 */
async function loadShiftTypes(
  firestore: FirestoreClient,
  groupId: string,
): Promise<Map<string, TypeInfo>> {
  const doc = await firestore.getDocument(`groups/${groupId}/settings/shiftTypes`);
  const raw = doc?.data.types;
  const source: readonly unknown[] =
    Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_SHIFT_TYPES;

  const entries = source
    .map(toTypeEntry)
    .filter((entry): entry is [string, TypeInfo] => entry !== null);
  return new Map(entries);
}

function toSegment(
  data: Record<string, unknown>,
  typeInfoByKey: ReadonlyMap<string, TypeInfo>,
): AgentShiftSegment {
  const type = typeof data.type === "string" ? data.type : "";
  const info = typeInfoByKey.get(type);
  return {
    type,
    label: info?.label ?? type,
    attendance: info?.attendance ?? "unknown",
    startTime: timeOrNull(data.startTime),
    endTime: timeOrNull(data.endTime),
  };
}

/** 開始時刻の早い順。終日(時刻なし)は末尾に置く。 */
function compareSegments(a: AgentShiftSegment, b: AgentShiftSegment): number {
  if (a.startTime === b.startTime) return 0;
  if (a.startTime === null) return 1;
  if (b.startTime === null) return -1;
  return a.startTime < b.startTime ? -1 : 1;
}

/**
 * 当日の勤務開始・終了。出勤扱い(attendance === "available")の区分だけから算出する。
 * 欠勤や、定義が消えた種別(却下・未定など)の時刻を混ぜると、終業時の再通知が
 * 実際には働いていない時刻に飛んでしまう。
 */
function workWindow(segments: readonly AgentShiftSegment[]): {
  workStart: string | null;
  workEnd: string | null;
} {
  const working = segments.filter((segment) => segment.attendance === "available");
  const starts = working
    .map((segment) => segment.startTime)
    .filter((time): time is string => time !== null);
  const ends = working
    .map((segment) => segment.endTime)
    .filter((time): time is string => time !== null);
  return {
    workStart: starts.length > 0 ? starts.reduce((min, time) => (time < min ? time : min)) : null,
    workEnd: ends.length > 0 ? ends.reduce((max, time) => (time > max ? time : max)) : null,
  };
}

export interface BuildAgentShiftsParams {
  firestore: FirestoreClient;
  groupId: string;
  /** `YYYY-MM-DD`(Asia/Tokyo基準の暦日) */
  date: string;
  /** タスク表・Slack側から渡ってくる氏名。表記ゆれは正規化して突き合わせる */
  name: string;
}

/**
 * 指定日・指定氏名の勤務予定を、エージェントへ返す最小限の形にして組み立てる。
 *
 * 返すのは氏名・開始時刻・終了時刻・勤務種別だけで、メールアドレスやFirebaseのuidは含めない
 * (計画5章「返す値は氏名、開始時刻、終了時刻、勤務種別だけに絞る」)。
 */
export async function buildAgentShifts({
  firestore,
  groupId,
  date,
  name,
}: BuildAgentShiftsParams): Promise<AgentShiftsResult> {
  // groupId は運用者がWorkerの設定に入れる値。ここに不正な文字が入っているのは設定ミスなので、
  // 利用者側の入力エラー(400)ではなく設定エラーとして扱う。
  if (!isValidPathSegment(groupId)) return { ok: false, status: 500, reason: "invalid_group_id" };
  if (!isValidDateKey(date)) return { ok: false, status: 400, reason: "invalid_date" };
  if (!isValidAgentName(name)) return { ok: false, status: 400, reason: "invalid_name" };

  const memberDocs = await firestore.queryCollection(`groups/${groupId}`, "members", [
    { field: "active", op: "==", value: true },
  ]);
  const member = findActiveMemberByName(memberDocs, name);
  if (!member.ok) {
    return {
      ok: false,
      status: member.reason === "ambiguous_name" ? 409 : 404,
      reason: member.reason,
    };
  }

  const [typeInfoByKey, shiftDocs] = await Promise.all([
    loadShiftTypes(firestore, groupId),
    firestore.queryCollection(`groups/${groupId}`, "shifts", [
      { field: "memberId", op: "==", value: member.memberId },
      { field: "date", op: "==", value: date },
    ]),
  ]);

  // クエリ結果を過信しない(Firestoreはサービスアカウントの管理者権限で読んでいるため、
  // ここで絞らないと他人・他日のシフトがそのまま外へ出る)。feed.ts と同じ多層防御。
  const segments = shiftDocs
    .filter((doc) => doc.data.memberId === member.memberId && doc.data.date === date)
    .map((doc) => toSegment(doc.data, typeInfoByKey))
    .sort(compareSegments);

  return {
    ok: true,
    payload: { date, name: member.displayName, ...workWindow(segments), segments },
  };
}
