import { hourValue, type CellState } from "./shiftVisual";

/** 1メンバーの期間内の労働時間。終日枠は時間が分からないので日数で別に持つ。 */
export interface WorkHoursSummary {
  fixedHours: number;
  wantHours: number;
  fixedUntimedDays: number;
  wantUntimedDays: number;
}

/** この長さ以上働いた日は、休憩1時間を取ったものとして差し引く */
export const BREAK_THRESHOLD_HOURS = 6;
export const BREAK_HOURS = 1;

/** 1日の拘束時間から休憩を引いた労働時間。6時間半なら5時間半、7時間なら6時間。 */
export function paidHoursOfDay(hours: number): number {
  return hours >= BREAK_THRESHOLD_HOURS ? hours - BREAK_HOURS : hours;
}

interface DayTotal {
  hours: number;
  untimed: boolean;
}

/** 1日分のうち、指定した kind（確定か希望）の時間を合算する。不可の種別は数えない。 */
function dayTotal(states: CellState[], kind: "fixed" | "want", unavailableKeys: ReadonlySet<string>): DayTotal {
  return states
    .filter((s) => s.kind === kind && !unavailableKeys.has(s.type))
    .reduce<DayTotal>(
      (acc, s) =>
        !s.startTime || !s.endTime
          ? { ...acc, untimed: true }
          : { ...acc, hours: acc.hours + Math.max(0, hourValue(s.endTime) - hourValue(s.startTime)) },
      { hours: 0, untimed: false },
    );
}

/**
 * 日ごとのセグメント一覧から、確定・希望それぞれの合計労働時間を出す。
 * 休憩控除は日ごと・確定と希望で別々に判定する（同じ日の複数枠は合算してから判定）。
 * 未回答と不可（欠勤・却下など unavailableKeys の種別）は数えない。
 */
export function summarizeWorkHours(days: CellState[][], unavailableKeys: ReadonlySet<string>): WorkHoursSummary {
  return days.reduce<WorkHoursSummary>(
    (acc, states) => {
      const fixed = dayTotal(states, "fixed", unavailableKeys);
      const want = dayTotal(states, "want", unavailableKeys);
      return {
        fixedHours: acc.fixedHours + paidHoursOfDay(fixed.hours),
        wantHours: acc.wantHours + paidHoursOfDay(want.hours),
        fixedUntimedDays: acc.fixedUntimedDays + (fixed.untimed ? 1 : 0),
        wantUntimedDays: acc.wantUntimedDays + (want.untimed ? 1 : 0),
      };
    },
    { fixedHours: 0, wantHours: 0, fixedUntimedDays: 0, wantUntimedDays: 0 },
  );
}

/** 8.5 → "8時間30分"。 */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}時間`;
  return h === 0 ? `${m}分` : `${h}時間${m}分`;
}
