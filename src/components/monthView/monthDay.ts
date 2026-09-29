/**
 * 月ビューの「1日のセル」と「月の合計」を組み立てる純粋関数。
 * セルには、その日にシフトがある人だけを1人1行で並べる（未回答は出さない）。
 */
import { hourValue, type CellState } from "../shiftVisual";
import { paidHoursOfDay } from "../workHours";

export interface DayEntry {
  memberId: string;
  /** その日の全セグメント（開始の早い順） */
  states: CellState[];
  /** 見た目の代表（確定 > 希望 > 不可） */
  primary: CellState;
  /** 時刻のある枠のうち最初の開始・最後の終了。無ければ null（終日） */
  start: string | null;
  end: string | null;
  /** 出てくる種別（重複なし、出現順） */
  typeKeys: string[];
}

function pickPrimary(states: CellState[]): CellState {
  return states.find((s) => s.kind === "fixed") ?? states.find((s) => s.kind === "want") ?? states[0];
}

export function dayEntries<T extends { id: string }>(
  members: readonly T[],
  statesOf: (memberId: string) => CellState[],
): DayEntry[] {
  return members.flatMap((member) => {
    const states = statesOf(member.id);
    if (states.length === 0) return [];
    const timed = states.filter((s) => s.startTime && s.endTime);
    const starts = timed.map((s) => s.startTime as string).sort((a, b) => hourValue(a) - hourValue(b));
    const ends = timed.map((s) => s.endTime as string).sort((a, b) => hourValue(b) - hourValue(a));
    return [{
      memberId: member.id,
      states,
      primary: pickPrimary(states),
      start: starts[0] ?? null,
      end: ends[0] ?? null,
      typeKeys: [...new Set(states.map((s) => s.type))],
    }];
  });
}

function trimMinutes(time: string): string {
  const [h, m] = time.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
}

/** セル内の短い表記。「10–17」「10:30–17」。 */
export function compactRange(start: string | null, end: string | null): string {
  if (!start || !end) return "終日";
  return `${trimMinutes(start)}–${trimMinutes(end)}`;
}

/** 内訳の表記。「10:00〜17:00」。 */
export function fullRange(start: string | null, end: string | null): string {
  if (!start || !end) return "終日";
  return `${start}〜${end}`;
}

function rawHours(state: CellState): number {
  if (!state.startTime || !state.endTime) return 0;
  return Math.max(0, hourValue(state.endTime) - hourValue(state.startTime));
}

/** その日の働く時間（不可は除く、休憩は引かない）。内訳の「7時間」に使う。 */
export function entryHours(states: readonly CellState[], unavailableKeys: ReadonlySet<string>): number {
  return states.filter((s) => !unavailableKeys.has(s.type)).reduce((sum, s) => sum + rawHours(s), 0);
}

/** 種別ごとの人数（「出勤 3人・リモート 1人」）。1人が同じ日に2種別あればそれぞれに数える。 */
export function countByType(entries: readonly DayEntry[], unavailableKeys: ReadonlySet<string>): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const key of entry.typeKeys) {
      if (unavailableKeys.has(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].map(([key, count]) => ({ key, count }));
}

export interface MonthTypeTotals {
  total: number;
  byType: { key: string; hours: number }[];
}

/**
 * メンバー1人の月の合計時間（確定＋希望）。種別ごとに日単位で合算し、
 * 6時間以上の日は休憩1時間を引く（既存の月合計ポップアップと同じ決まり）。終日枠は時間に入れない。
 */
export function monthTypeTotals(days: readonly CellState[][], unavailableKeys: ReadonlySet<string>): MonthTypeTotals {
  const byType = new Map<string, number>();
  for (const states of days) {
    const perDay = new Map<string, number>();
    for (const state of states) {
      if (state.kind === "none" || unavailableKeys.has(state.type)) continue;
      perDay.set(state.type, (perDay.get(state.type) ?? 0) + rawHours(state));
    }
    for (const [key, hours] of perDay) {
      if (hours > 0) byType.set(key, (byType.get(key) ?? 0) + paidHoursOfDay(hours));
    }
  }
  const list = [...byType].map(([key, hours]) => ({ key, hours }));
  return { total: list.reduce((sum, item) => sum + item.hours, 0), byType: list };
}
