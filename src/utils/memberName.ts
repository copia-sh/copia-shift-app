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
