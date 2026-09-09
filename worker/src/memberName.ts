import type { FirestoreDocument } from "./firestoreRest";
import { isValidPathSegment } from "./pathSegment";

/**
 * 氏名を突き合わせ用のキーに正規化する。
 *
 * Slack側の入力・タスク表の担当者名・シフトアプリの displayName は、姓名の間の空白
 * (半角/全角)や英数字の全角/半角がまちまちになりやすい。NFKC で全角英数を半角へ畳み、
 * 半角空白・全角空白をまとめて落として小文字化し、姓名の間の空白の有無や種類が違っても同一視する。
 */
export function normalizeMemberName(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

export type MemberNameLookup =
  | { ok: true; memberId: string; displayName: string }
  | { ok: false; reason: "name_not_found" | "ambiguous_name" };

export interface ActiveMember {
  memberId: string;
  displayName: string;
}

/**
 * active な有効メンバーだけを、識別子を外部に出さない呼び出し側向けに整形する。
 * 読めないドキュメントは空配列にして落とすため、`flatMap` にそのまま渡せる。
 */
export function toActiveMember(member: FirestoreDocument): ActiveMember[] {
  if (member.data.active !== true || !isValidPathSegment(member.id)) return [];
  const displayName = member.data.displayName;
  return typeof displayName === "string" && normalizeMemberName(displayName)
    ? [{ memberId: member.id, displayName }]
    : [];
}

/**
 * 在籍中(active)のメンバーの中から、氏名が一致する1名を特定する。
 *
 * 同姓同名が2件以上あるときは、どちらか一方を選ぶと他人のシフトを本人へ返してしまうため、
 * 必ず `ambiguous_name` を返して呼び出し側に確認させる(計画3-1「氏名が一致しない場合だけ確認する」)。
 * ドキュメントIDは後段でFirestoreのパスに埋め込まれるので、ここで安全な文字だけに限定する。
 */
export function findActiveMemberByName(
  members: readonly FirestoreDocument[],
  name: string,
): MemberNameLookup {
  const key = normalizeMemberName(name);
  if (!key) return { ok: false, reason: "name_not_found" };

  // `toActiveMember` で active・ID・表示名を検証してから、表記ゆれを吸収して照合する。
  const matches = members.flatMap(toActiveMember).filter((member) => normalizeMemberName(member.displayName) === key);

  if (matches.length === 0) return { ok: false, reason: "name_not_found" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_name" };
  return { ok: true, ...matches[0] };
}
