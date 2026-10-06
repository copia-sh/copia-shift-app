import type { Member } from "../../types";
import type { ShiftTheme, Skin } from "../shiftTheme";
import { darken, lighten } from "../shiftTheme";
import type { CellState } from "../shiftVisual";
import type { DayEntry } from "./monthDay";
import { COLOR } from "../../theme/palette";

export const SELECTED_RING = `0 0 0 2px ${COLOR.brand}`;

/** メンバー色を、淡い背景の上でも読める文字色にする。 */
export function memberInk(member: Pick<Member, "color">): string {
  return darken(member.color, 0.25);
}

const FALLBACK_SKIN: Skin = {
  bg: COLOR.line4, border: COLOR.line, borderStyle: "solid", borderWidth: "1px", fg: COLOR.ink3, shadow: "", mark: "", label: "",
};

/**
 * 月ビューの1行の色。名前をメンバー色で読めるよう、どの状態も淡い塗りにして、
 * 確定は実線・希望は破線の枠で見分ける（一覧・週の塗り分けと同じ決まり）。
 */
export function skinOf(theme: ShiftTheme | null, state: CellState, selected: boolean): Skin {
  if (!theme || state.kind === "none") return FALLBACK_SKIN;
  const base = theme.defOf(state.type).color;
  return {
    bg: lighten(base, selected ? 0.7 : 0.84),
    border: base,
    borderStyle: state.kind === "want" ? "dashed" : "solid",
    borderWidth: "1px",
    fg: darken(base, 0.3),
    shadow: "",
    mark: "",
    label: "",
  };
}

export function entryStyle(skin: Skin, selected: boolean): React.CSSProperties {
  const style: React.CSSProperties = {
    backgroundColor: skin.bg,
    borderColor: skin.border,
    borderStyle: skin.borderStyle,
    borderWidth: skin.borderWidth,
    color: skin.fg,
  };
  return selected ? { ...style, boxShadow: SELECTED_RING } : style;
}

/** 種別の表示名（「出勤・リモート」）。テーマが無いときはキーのまま。 */
export function typeLabel(theme: ShiftTheme | null, keys: readonly string[]): string {
  return keys.map((key) => (theme ? theme.defOf(key).label : key)).join("・");
}

export function dowColor(dow: number): string {
  return dow === 0 ? COLOR.coral : dow === 6 ? COLOR.brand : COLOR.ink4;
}

/** 日付の文字色。月の外は薄く、平日は黒、土日は曜日の色。 */
export function dateInk(day: Date, inMonth: boolean): string {
  if (!inMonth) return COLOR.inkNone;
  const dow = day.getDay();
  return dow === 0 || dow === 6 ? dowColor(dow) : COLOR.ink;
}

/** その日に働く人数（不可だけの人は数えない）。 */
export function workingCount(entries: readonly DayEntry[], unavailableKeys: ReadonlySet<string>): number {
  return entries.filter((entry) => entry.typeKeys.some((key) => !unavailableKeys.has(key))).length;
}
