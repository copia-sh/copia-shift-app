import { toJstDateKey } from "./feed";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** メンバー×日付の交点を引くキー。氏名に区切り文字が現れないよう NUL を使う。 */
export const matrixKey = (name: string, date: string): string => `${name}\u0000${date}`;

/** 今日（JST）から days 日ぶんの暦日を並べる。 */
export function matrixDates(now: Date, days: number): string[] {
  return Array.from({ length: days }, (_, offset) =>
    toJstDateKey(new Date(now.getTime() + offset * MS_PER_DAY)),
  );
}

/** 「9/28(月)」。列が増えるので、年は1行目の更新日時に任せて日付だけを短く出す。 */
function columnLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}(${dow})`;
}

export interface BuildShiftMatrixParams {
  dates: readonly string[];
  /** 行に並べる氏名。呼び出し側で並び順を決める */
  names: readonly string[];
  /** matrixKey() → セルの文字列 */
  cells: ReadonlyMap<string, string>;
  updatedAt: string;
}

/**
 * メンバー×日付の月間表を作る。
 *
 * 1行目に更新日時、2行目に日付、3行目以降が1人1行。シフトの無い交点は空欄にする。
 * 空欄をそのまま書くことが大事で、前回の書き込みが残ると「消えたはずの予定」が
 * 表に残り続ける（却下された枠がこれで消える）。
 */
export function buildShiftMatrix({
  dates,
  names,
  cells,
  updatedAt,
}: BuildShiftMatrixParams): string[][] {
  const header = ["更新日時", updatedAt, ...Array.from({ length: Math.max(0, dates.length - 1) }, () => "")];
  const columns = ["氏名", ...dates.map(columnLabel)];
  const rows = names.map((name) => [
    name,
    ...dates.map((date) => cells.get(matrixKey(name, date)) ?? ""),
  ]);
  return [header, columns, ...rows];
}
