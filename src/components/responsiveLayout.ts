/**
 * 表の寸法。段階2Aのアートボード（S1 差分メモ）に合わせる。
 *
 * 文字を縮めて詰め込むのはやめ、「並べる数を絞って、残りは詳細で読む」方針に揃える。
 * ここを変えるときは、12px（補足の下限）を割らないかを必ず確認する。
 */

/** 一覧・週で1つのセルに並べる枠の上限。超えた分は「＋n」で畳む。 */
export const MAX_INLINE_SEGMENTS = 2;

/** 月セルに並べるメンバーの上限。超えた分は「＋n人」で畳む。 */
export const MONTH_MAX_CHIPS = 4;

/** 一覧: 1日ぶんの列幅。16pxの記号を2つ縦に積める幅。 */
export const LIST_DAY_WIDTH = 56;

/** 一覧: 全枠を開いたときの行の高さ。16px×6＋余白。 */
export const LIST_ROW_EXPANDED = 116;

/** 週: 時刻列の幅。「9:00」を12pxで切らずに置く。 */
export const WEEK_TIME_COL_WIDTH = 56;

export function listRowHeight(density: "compact" | "comfortable" = "comfortable"): number {
  return density === "compact" ? 40 : 50;
}

export function monthMemberColumns(memberCount: number): number {
  if (memberCount <= 1) return 1;
  if (memberCount <= 4) return 2;
  return 3;
}

/** 月セルの高さ。人ごと表示は118px、日別の要約は122px。 */
export function monthCellMinHeight(summary = false): number {
  return summary ? 122 : 118;
}

/**
 * 週の1日ぶんの幅。人数に比例させると、人が増えるほど1枠が細くなり、
 * 文字が8pxまで縮んでいた。並べる数を2枠までに固定し、幅も固定する。
 */
export function weekDayWidth(): number {
  return 120;
}

export function listNameWidth(viewportWidth: number): number {
  return viewportWidth < 768 ? 96 : 168;
}

/**
 * 月ビューを既定で「日別の要約」にするか。人数が多いと、人ごとのチップは
 * 読めない大きさにしかならない。利用者の切替は別に保存する。
 */
export function monthSummaryDefault(memberCount: number): boolean {
  return memberCount > 18;
}
