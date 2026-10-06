/**
 * JS から色そのものを扱う必要がある場所の、唯一の定義場所。
 *
 * 見た目の指定は原則 Tailwind のユーティリティ（bg-brand / text-ink-4 …）で書く。
 * ここに置くのは、クラス名では済まない次の2つだけ:
 *   1. style 属性や、濃淡を計算して作る色（shiftTheme の mixHex/lighten/darken に渡す元の色）
 *   2. Firestore に保存される色（勤務区分の既定色、メンバーの色）
 *
 * 値は src/index.css の @theme と一致していなければならない。
 * tests/palette.test.ts が index.css を読んで突き合わせているので、片方だけ変えると落ちる。
 * キー名は @theme のトークン名と機械的に対応する（brandWash2 ⇔ --color-brand-wash-2）。
 */
export const COLOR = {
  brand: "#248DD4",
  brandDeep: "#0863A0",
  brandPress: "#1B6FA8",
  brandLine: "#A7D1EE",
  brandTint: "#D1E9F9",
  brandWash: "#EDF6FD",
  brandWash2: "#F1F8FE",
  brandWash3: "#F7FBFE",
  teal: "#1F8A98",
  coral: "#D9736F",
  orange: "#E08A2E",
  today: "#F9E428",
  todayWash: "#FFF6D6",
  todayWash2: "#FFFBEA",
  todayWash3: "#FFFDF4",
  ink: "#111827",
  ink2: "#374151",
  ink3: "#4B5563",
  ink4: "#6B7280",
  ink5: "#9CA3AF",
  inkNone: "#C8CDD2",
  line: "#E5E7EB",
  line4: "#F4F6F8",
  edge: "#E3E3E3",
  page: "#F7F9FB",
  surface: "#FFFFFF",
  surface3: "#FAFBFC",
} as const;

export type ColorKey = keyof typeof COLOR;

/** brandWash2 → --color-brand-wash-2。大文字と数字の前で区切る。 */
export function cssTokenOf(key: ColorKey): string {
  return `--color-${key.replace(/([A-Z])|([0-9]+)/g, (_, upper, digits) =>
    upper ? `-${upper.toLowerCase()}` : `-${digits}`)}`;
}

/** 色の計算（lighten/darken）の両端。トークンではなく計算の都合で持つ値。 */
export const WHITE = "#ffffff";
export const BLACK = "#000000";

/** 管理者が消した勤務区分を参照している古いデータに使う、意味を持たせないグレー。 */
export const UNKNOWN_TYPE_COLOR = "#999999";

/**
 * メンバーに割り当てる色。デザイントークンではなく「区別がつく色の並び」なので、
 * @theme には置かず、ここで順番ごと持つ。並びを変えても既存メンバーの色は変わらない
 * （色は作成時に Firestore へ焼き込まれる）が、新規メンバーの割り当て順は変わる。
 */
export const MEMBER_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
] as const;
