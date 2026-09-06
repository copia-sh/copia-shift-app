import { buildIcalendar, shiftsToIcalEvents } from "../../src/utils/ical";
import type { Shift, ShiftStatus } from "../../src/types";
import type { FirestoreClient } from "./firestoreRest";
import { isValidPathSegment } from "./pathSegment";

/** 購読リンクが返す範囲。無期限にすると過去分のクエリ・データ量が際限なく増えるため区切る。 */
const FEED_WINDOW_DAYS_PAST = 60;
const FEED_WINDOW_DAYS_FUTURE = 180;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Shift.date は実質 Asia/Tokyo 基準の暦日。Cloudflare Workers はUTCで動くため、
 * date-fns の addDays/format (実行環境のローカルタイムゾーン依存)は使わず、
 * UTCエポックの計算だけで実行環境に依存しないJST日付キーを作る。
 */
export function toJstDateKey(instant: Date): string {
  const jst = new Date(instant.getTime() + JST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

interface ShareLinkRecord {
  memberId: string;
  statuses: ShiftStatus[];
  typeKeys: string[];
}

function parseShareLink(data: Record<string, unknown>): ShareLinkRecord | null {
  const { memberId, statuses, typeKeys } = data;
  if (
    typeof memberId !== "string" ||
    !memberId ||
    !Array.isArray(statuses) ||
    statuses.length === 0 ||
    !statuses.every((s) => s === "desired" || s === "confirmed") ||
    !Array.isArray(typeKeys) ||
    typeKeys.length === 0 ||
    !typeKeys.every((t) => typeof t === "string")
  ) {
    return null;
  }
  return { memberId, statuses: statuses as ShiftStatus[], typeKeys: typeKeys as string[] };
}

function toShift(id: string, data: Record<string, unknown>): Shift {
  return {
    id,
    memberId: data.memberId as string,
    date: data.date as string,
    status: data.status as ShiftStatus,
    type: data.type as string,
    startTime: (data.startTime as string) ?? null,
    endTime: (data.endTime as string) ?? null,
    createdBy: (data.createdBy as string) ?? "",
    createdAt: null,
    confirmedBy: (data.confirmedBy as string) ?? null,
    confirmedAt: null,
    updatedAt: null,
  };
}

export interface BuildFeedParams {
  firestore: FirestoreClient;
  groupId: string;
  token: string;
  labelOf?: (typeKey: string) => string;
  now?: Date;
}

export type BuildFeedResult = { ok: true; icalendar: string } | { ok: false; status: 404 | 403 };

/**
 * トークンから購読リンクを解決し、本人の(かつ発行時に選んだ状態・種別に絞った)シフトだけを
 * icalendar 文字列にして返す。クエリ結果を過信せず、statuses/typeKeys/memberId の3つで
 * アプリ側でも必ず絞り込む(多層防御: Firestore 側は管理者権限で読んでいるため、
 * ここで絞らないと他人の全シフトが見えてしまう)。
 */
export async function buildFeed({
  firestore,
  groupId,
  token,
  labelOf = (key) => key,
  now = new Date(),
}: BuildFeedParams): Promise<BuildFeedResult> {
  // groupId/token はデコード後にFirestoreパスへそのまま埋め込まれる。ここで弾かないと、
  // 例えば token="x/../../members/M1" のような値がURL正規化で別ドキュメントに解決されてしまう。
  if (!isValidPathSegment(groupId) || !isValidPathSegment(token)) {
    return { ok: false, status: 404 };
  }

  const linkDoc = await firestore.getDocument(`groups/${groupId}/shareLinks/${token}`);
  if (!linkDoc) return { ok: false, status: 404 };

  const link = parseShareLink(linkDoc.data);
  if (!link) return { ok: false, status: 403 };

  const memberDoc = await firestore.getDocument(`groups/${groupId}/members/${link.memberId}`);
  if (!memberDoc || memberDoc.data.active !== true) return { ok: false, status: 404 };

  const startDate = toJstDateKey(new Date(now.getTime() - FEED_WINDOW_DAYS_PAST * MS_PER_DAY));
  const endDate = toJstDateKey(new Date(now.getTime() + FEED_WINDOW_DAYS_FUTURE * MS_PER_DAY));

  const shiftDocs = await firestore.queryCollection(`groups/${groupId}`, "shifts", [
    { field: "memberId", op: "==", value: link.memberId },
    { field: "date", op: ">=", value: startDate },
    { field: "date", op: "<=", value: endDate },
  ]);

  const statuses = new Set(link.statuses);
  const typeKeys = new Set(link.typeKeys);
  const shifts = shiftDocs
    .map((doc) => toShift(doc.id, doc.data))
    .filter(
      (shift) =>
        shift.memberId === link.memberId &&
        statuses.has(shift.status) &&
        typeKeys.has(shift.type) &&
        shift.date >= startDate &&
        shift.date <= endDate,
    );

  const events = shiftsToIcalEvents({
    shifts,
    labelOf,
    isUnavailable: () => false,
    includeUnavailable: true,
  });

  return { ok: true, icalendar: buildIcalendar(events, { calendarName: "Copia シフト", now }) };
}
