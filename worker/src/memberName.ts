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

  // filter ではなく flatMap。filter は型の絞り込みを呼び出し側へ伝えないため、
  // displayName を string として取り出すのにキャストが必要になってしまう。
  const matches = members.flatMap((member) => {
    if (member.data.active !== true) return [];
    if (!isValidPathSegment(member.id)) return [];
    const displayName = member.data.displayName;
    if (typeof displayName !== "string") return [];
    if (normalizeMemberName(displayName) !== key) return [];
    return [{ memberId: member.id, displayName }];
  });

  if (matches.length === 0) return { ok: false, reason: "name_not_found" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_name" };
  return { ok: true, ...matches[0] };
}
