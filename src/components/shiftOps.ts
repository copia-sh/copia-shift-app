import type { Shift, ShiftType } from "../types";
import { REJECTED_TYPE } from "../types";
import { cellStatesOf, selKey, validateSegments, type BulkOp, type CellState, type SelKey } from "./shiftVisual";

/**
 * 表示と操作の単位を「枠（セグメント）」に揃えるための純粋関数群。
 *
 * 画面側は「どのセルを選んだか」しか知らない。ここで選択セルを枠へ展開し、
 * 実際に書き込む操作と、対象外になった理由を先に確定させる。書き込み層に
 * 判断を持たせないことで、一覧・月・週・まとめて編集で意味が揃う。
 */

/** 1メンバー×1日。そのセルが持つ全枠を保持する。 */
export interface CellTarget {
  memberId: string;
  dateKey: string;
  shifts: Shift[];
  states: CellState[];
}

export function buildCellTarget(
  memberId: string,
  dateKey: string,
  shifts: Shift[],
  unavailableKeys: ReadonlySet<string>,
): CellTarget {
  return { memberId, dateKey, shifts, states: cellStatesOf(shifts, unavailableKeys) };
}

/** 書き込み層へ渡す1件分の操作。Firestore の API には依存しない。 */
export type ShiftAction =
  | {
      kind: "update";
      shiftId: string;
      updates: { type?: ShiftType; startTime?: string | null; endTime?: string | null };
    }
  | {
      kind: "create";
      memberId: string;
      date: string;
      type: ShiftType;
      startTime: string | null;
      endTime: string | null;
    }
  | { kind: "delete"; shiftId: string }
  | { kind: "confirm"; shiftId: string }
  | { kind: "revert"; shiftId: string };

export const SKIP_REASONS = {
  noPermission: "この操作を行う権限がありません",
  notShiftTarget: "シフト対象外のメンバーです",
  otherMember: "他の人の希望は変更できません",
  confirmed: "確定済みのため変更できません",
  noDesired: "確定できる希望枠がありません",
  noConfirmed: "取り消せる確定枠がありません",
  noSegment: "枠がないため時間を適用できません",
  manySegments: "複数枠には時間をまとめて適用できません",
  nothingToChange: "変更する枠がありません",
} as const;

export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS];

export interface SkippedCell {
  key: SelKey;
  memberId: string;
  dateKey: string;
  reason: SkipReason;
}

export interface BulkPlan {
  actions: ShiftAction[];
  /** 実際に1件以上の書き込みが発生するセル */
  applied: SelKey[];
  skipped: SkippedCell[];
}

export interface BulkContext {
  currentMemberId: string;
  canConfirm: boolean;
  /**
   * シフトを登録する対象のメンバーID。渡さなければ全員を対象とみなす。
   * 画面側の選択だけに頼ると、対象外の行から選べてしまうので、
   * 書き込みを組み立てるここでも止める。
   */
  shiftTargetMemberIds?: ReadonlySet<string>;
}

/** 選択内容の要約。日・人・枠は別々に数える（1つの数字にまとめない）。 */
export interface TargetSummary {
  dates: number;
  members: number;
  cells: number;
  segments: number;
  fixed: number;
  want: number;
  no: number;
  emptyCells: number;
}

export function summarizeTargets(targets: CellTarget[]): TargetSummary {
  const all = targets.flatMap((t) => t.states);
  return {
    dates: new Set(targets.map((t) => t.dateKey)).size,
    members: new Set(targets.map((t) => t.memberId)).size,
    cells: targets.length,
    segments: all.length,
    fixed: all.filter((s) => s.kind === "fixed").length,
    want: all.filter((s) => s.kind === "want").length,
    no: all.filter((s) => s.kind === "no").length,
    emptyCells: targets.filter((t) => t.states.length === 0).length,
  };
}

const isConfirmed = (shift: Shift) => shift.status === "confirmed";

/** 選択セルを、実行する操作と対象外の理由へ展開する。ここでは書き込まない。 */
export function planBulkOp(targets: CellTarget[], op: BulkOp, ctx: BulkContext): BulkPlan {
  const actions: ShiftAction[] = [];
  const applied: SelKey[] = [];
  const skipped: SkippedCell[] = [];

  const skip = (target: CellTarget, reason: SkipReason) =>
    skipped.push({
      key: selKey(target.memberId, target.dateKey),
      memberId: target.memberId,
      dateKey: target.dateKey,
      reason,
    });

  const reviewOp = op.kind === "confirm" || op.kind === "revert" || op.kind === "reject";

  for (const target of targets) {
    const before = actions.length;

    if (ctx.shiftTargetMemberIds && !ctx.shiftTargetMemberIds.has(target.memberId)) {
      skip(target, SKIP_REASONS.notShiftTarget);
      continue;
    }
    if (reviewOp && !ctx.canConfirm) {
      skip(target, SKIP_REASONS.noPermission);
      continue;
    }
    if (!reviewOp && target.memberId !== ctx.currentMemberId) {
      skip(target, SKIP_REASONS.otherMember);
      continue;
    }

    const editable = target.shifts.filter((s) => !isConfirmed(s));

    if (op.kind === "desired" || op.kind === "unavailable") {
      if (target.shifts.length === 0) {
        actions.push({
          kind: "create",
          memberId: target.memberId,
          date: target.dateKey,
          type: op.type,
          startTime: null,
          endTime: null,
        });
      } else if (editable.length === 0) {
        skip(target, SKIP_REASONS.confirmed);
        continue;
      } else {
        for (const shift of editable) {
          if (shift.type !== op.type) {
            actions.push({ kind: "update", shiftId: shift.id, updates: { type: op.type } });
          }
        }
      }
    } else if (op.kind === "clear") {
      if (editable.length === 0) {
        skip(target, target.shifts.length > 0 ? SKIP_REASONS.confirmed : SKIP_REASONS.nothingToChange);
        continue;
      }
      for (const shift of editable) {
        actions.push({ kind: "delete", shiftId: shift.id });
      }
    } else if (op.kind === "time") {
      if (editable.length === 0) {
        skip(target, target.shifts.length > 0 ? SKIP_REASONS.confirmed : SKIP_REASONS.noSegment);
        continue;
      }
      // 同じ時刻を複数枠へ一括適用すると、重なった枠が同時に存在してしまう。
      // 何件が対象外だったかを返し、利用者が個別編集へ回れるようにする。
      if (editable.length > 1) {
        skip(target, SKIP_REASONS.manySegments);
        continue;
      }
      const shift = editable[0];
      if (shift.startTime !== op.startTime || shift.endTime !== op.endTime) {
        actions.push({
          kind: "update",
          shiftId: shift.id,
          updates: { startTime: op.startTime, endTime: op.endTime },
        });
      }
    } else if (op.kind === "confirm") {
      // 確定できるのは希望枠だけ。不可・却下・確定済みは対象にしない。
      const confirmable = target.states.filter((s) => s.kind === "want" && s.shift);
      if (confirmable.length === 0) {
        skip(target, SKIP_REASONS.noDesired);
        continue;
      }
      for (const state of confirmable) {
        actions.push({ kind: "confirm", shiftId: state.shift!.id });
      }
    } else if (op.kind === "revert") {
      const confirmed = target.shifts.filter(isConfirmed);
      if (confirmed.length === 0) {
        skip(target, SKIP_REASONS.noConfirmed);
        continue;
      }
      for (const shift of confirmed) {
        actions.push({ kind: "revert", shiftId: shift.id });
      }
    } else if (op.kind === "reject") {
      const rejectable = editable.filter((s) => s.type !== REJECTED_TYPE);
      if (rejectable.length === 0) {
        skip(target, target.shifts.length > 0 ? SKIP_REASONS.confirmed : SKIP_REASONS.nothingToChange);
        continue;
      }
      for (const shift of rejectable) {
        actions.push({ kind: "update", shiftId: shift.id, updates: { type: REJECTED_TYPE } });
      }
    }

    if (actions.length > before) {
      applied.push(selKey(target.memberId, target.dateKey));
    } else {
      skip(target, SKIP_REASONS.nothingToChange);
    }
  }

  return { actions, applied, skipped };
}

export interface DaySegmentInput {
  id?: string;
  type: ShiftType;
  startTime: string | null;
  endTime: string | null;
}

export interface DaySavePlan {
  actions: ShiftAction[];
  /** 検証に失敗した理由。null でなければ1件も書き込まない */
  error: string | null;
}

export const DAY_SAVE_CONFLICT =
  "編集中に他の人が同じ日の枠を変更しました。いったん閉じて、最新の内容で編集し直してください";

/**
 * 編集を開始した時点の枠と、保存しようとしている時点の枠が同じかを見る。
 * 編集画面が持つのは開いた瞬間の写しなので、これを見ないと、開いている間に
 * 入った他の人の変更（書き換え・確定・追加・削除）を黙って上書き・削除する。
 */
function hasConcurrentChange(baseline: Shift[], existing: Shift[]): boolean {
  if (baseline.length !== existing.length) return true;
  const byId = new Map(existing.map((s) => [s.id, s]));
  return baseline.some((base) => {
    const current = byId.get(base.id);
    if (!current) return true;
    return (
      current.status !== base.status ||
      current.type !== base.type ||
      current.startTime !== base.startTime ||
      current.endTime !== base.endTime
    );
  });
}

/**
 * 1日分の枠編集を「1回の保存」へまとめる。
 * - 編集開始時（baseline）から中身が変わっていたら、1件も書き込まずに止める
 * - 確定済みの枠は編集も削除もしない（確定の取消が先）
 * - 確定済みを含めた保存後の全枠を検証し、不正なら1件も書き込まない
 * - 変更のない枠には操作を作らない（連打で同じ更新を積まない）
 */
export function planDaySave(params: {
  memberId: string;
  date: string;
  existing: Shift[];
  /** 編集を開始した時点の枠。省略すると競合を検査しない */
  baseline?: Shift[];
  next: DaySegmentInput[];
  maxSegments?: number;
}): DaySavePlan {
  const { memberId, date, existing, baseline, next, maxSegments = 4 } = params;

  if (baseline && hasConcurrentChange(baseline, existing)) {
    return { actions: [], error: DAY_SAVE_CONFLICT };
  }
  const locked = existing.filter(isConfirmed);
  const lockedIds = new Set(locked.map((s) => s.id));
  const editableNext = next.filter((seg) => !seg.id || !lockedIds.has(seg.id));

  const validationError = validateSegments(
    [
      ...locked.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
      ...editableNext.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
    ],
    maxSegments,
  );
  if (validationError) {
    return { actions: [], error: validationError };
  }

  const byId = new Map(existing.map((s) => [s.id, s]));
  const actions: ShiftAction[] = [];

  for (const seg of editableNext) {
    const current = seg.id ? byId.get(seg.id) : undefined;
    if (!current) {
      actions.push({
        kind: "create",
        memberId,
        date,
        type: seg.type,
        startTime: seg.startTime,
        endTime: seg.endTime,
      });
      continue;
    }
    if (
      current.type !== seg.type ||
      current.startTime !== seg.startTime ||
      current.endTime !== seg.endTime
    ) {
      actions.push({
        kind: "update",
        shiftId: current.id,
        updates: { type: seg.type, startTime: seg.startTime, endTime: seg.endTime },
      });
    }
  }

  const keptIds = new Set(editableNext.filter((s) => s.id).map((s) => s.id!));
  for (const shift of existing) {
    if (isConfirmed(shift) || keptIds.has(shift.id)) continue;
    actions.push({ kind: "delete", shiftId: shift.id });
  }

  return { actions, error: null };
}

export interface BulkOutcome {
  /** 実際に書き込んだ操作の件数（枠単位） */
  writtenSegments: number;
  appliedCells: number;
  skipped: SkippedCell[];
  /** 1回のバッチで書けたか。false のときは「全部まとめて保存した」と言わない */
  atomic: boolean;
}

/**
 * 一括操作の結果を、日・人・枠を混同しない文にする。
 * 「何件が対象外で、なぜか」を必ず含める（画面に出ない差分を作らないため）。
 */
export function describeBulkOutcome(outcome: BulkOutcome): string {
  const parts: string[] = [];
  if (outcome.writtenSegments > 0) {
    parts.push(`${outcome.writtenSegments}枠を更新しました（${outcome.appliedCells}セル）`);
  }

  if (outcome.skipped.length > 0) {
    const counts = new Map<string, number>();
    for (const item of outcome.skipped) {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
    }
    const detail = [...counts.entries()].map(([reason, count]) => `${reason}（${count}セル）`).join(" / ");
    parts.push(`対象外 ${outcome.skipped.length}セル: ${detail}`);
  }

  if (parts.length === 0) return "変更はありませんでした";

  if (!outcome.atomic) {
    parts.push("件数が多いため複数回に分けて保存しました。失敗した場合は一部だけ反映されることがあります");
  }
  return parts.join(" / ");
}
