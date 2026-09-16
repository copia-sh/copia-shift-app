import type { Shift, ShiftType } from "../types";
import { planDaySave, type ShiftAction } from "../components/shiftOps";

/**
 * 繰り返し入力を「再利用」に置き換えるための純粋関数。
 *
 * タップで即保存するのをやめた分、同じ内容を何度も選び直す手数が増える。
 * よく使う組み合わせと、先週の同じ曜日を1タップで埋められるようにする。
 */

export interface TemplateSegment {
  type: ShiftType;
  startTime: string | null;
  endTime: string | null;
}

export interface DayTemplate {
  /** 同じ組み合わせを1つにまとめるためのキー */
  key: string;
  segments: TemplateSegment[];
  usedCount: number;
}

const segmentKey = (segment: TemplateSegment) =>
  `${segment.type}@${segment.startTime ?? "-"}-${segment.endTime ?? "-"}`;

/** 枠の集まりを表すキー。並び順が違っても同じ組み合わせは同じキーになる。 */
export function templateKeyOf(segments: TemplateSegment[]): string {
  return segments.map(segmentKey).sort().join("|");
}

const toSegment = (shift: Shift): TemplateSegment => ({
  type: shift.type,
  startTime: shift.startTime,
  endTime: shift.endTime,
});

/**
 * 自分が登録した内容から、よく使う組み合わせを多い順に返す。
 * 不可・却下は「型」として繰り返す性質のものではないので除く。
 */
export function suggestTemplates(
  shifts: Shift[],
  memberId: string,
  unavailableKeys: ReadonlySet<string> = new Set(),
  limit = 3,
): DayTemplate[] {
  const byDate = new Map<string, Shift[]>();
  for (const shift of shifts) {
    if (shift.memberId !== memberId) continue;
    if (unavailableKeys.has(shift.type)) continue;
    const list = byDate.get(shift.date) ?? [];
    byDate.set(shift.date, [...list, shift]);
  }

  const counts = new Map<string, DayTemplate>();
  for (const dayShifts of byDate.values()) {
    const segments = dayShifts
      .map(toSegment)
      .sort((a, b) => segmentKey(a).localeCompare(segmentKey(b)));
    const key = templateKeyOf(segments);
    const current = counts.get(key);
    counts.set(key, {
      key,
      segments,
      usedCount: (current?.usedCount ?? 0) + 1,
    });
  }

  return [...counts.values()]
    .sort((a, b) => b.usedCount - a.usedCount || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 同じ曜日の直近の入力を返す。1週間前が空なら、さらに前の同じ曜日をたどる。
 * 見つからなければ null（推測で埋めない）。
 */
export function previousWeekdaySegments(
  shifts: Shift[],
  memberId: string,
  dateKey: string,
  weeksBack = 4,
): TemplateSegment[] | null {
  for (let week = 1; week <= weeksBack; week++) {
    const target = shiftDateKey(dateKey, -7 * week);
    const found = shifts.filter((shift) => shift.memberId === memberId && shift.date === target);
    if (found.length > 0) {
      return found.map(toSegment);
    }
  }
  return null;
}

export interface TemplateApplySkip {
  dateKey: string;
  reason: string;
}

export interface TemplateApplyPlan {
  actions: ShiftAction[];
  skipped: TemplateApplySkip[];
  appliedDates: string[];
}

/**
 * 同じ枠を複数日へ適用する計画。確定済みを含む日は書き換えない。
 * 変更のない日は「すでに同じ内容です」として数え、無駄な書き込みを作らない。
 */
export function planTemplateApply(params: {
  memberId: string;
  dates: string[];
  segments: TemplateSegment[];
  existingByDate: ReadonlyMap<string, Shift[]>;
  maxSegments: number;
}): TemplateApplyPlan {
  const { memberId, dates, segments, existingByDate, maxSegments } = params;
  const actions: ShiftAction[] = [];
  const skipped: TemplateApplySkip[] = [];
  const appliedDates: string[] = [];

  for (const dateKey of dates) {
    const existing = existingByDate.get(dateKey) ?? [];
    if (existing.some((shift) => shift.status === "confirmed")) {
      skipped.push({ dateKey, reason: "確定済みのため変更できません" });
      continue;
    }

    // 既存の未確定枠を、テンプレートの枠で置き換える。1日分の検証と
    // 更新・新規・削除の組み立ては planDaySave と同じものを使う。
    const editable = existing.filter((shift) => shift.status !== "confirmed");
    const next = segments.map((segment, index) => ({
      id: editable[index]?.id,
      type: segment.type,
      startTime: segment.startTime,
      endTime: segment.endTime,
    }));

    const plan = planDaySave({ memberId, date: dateKey, existing, next, maxSegments });
    if (plan.error) {
      skipped.push({ dateKey, reason: plan.error });
      continue;
    }
    if (plan.actions.length === 0) {
      skipped.push({ dateKey, reason: "すでに同じ内容です" });
      continue;
    }
    actions.push(...plan.actions);
    appliedDates.push(dateKey);
  }

  return { actions, skipped, appliedDates };
}

/**
 * 編集中の下書きへテンプレートを当てる。既存の行のIDは位置で引き継ぎ、
 * 同じ枠を消して作り直さない（IDが変わると履歴や参照が切れる）。
 */
export function applyTemplateToDraft(
  draft: { id?: string }[],
  segments: TemplateSegment[],
): { id?: string; type: ShiftType; startTime: string | null; endTime: string | null }[] {
  return segments.map((segment, index) => ({
    id: draft[index]?.id,
    type: segment.type,
    startTime: segment.startTime,
    endTime: segment.endTime,
  }));
}
