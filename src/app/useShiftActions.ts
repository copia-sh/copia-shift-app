import { useState } from "react";
import {
  createShiftsBulk,
  deleteShiftsBulk,
  confirmShift,
  revertShiftToDesired,
  updateShiftDetails,
} from "../firebase/shifts";
import {
  updateMemberRole,
  updateMemberActive,
  updateMemberShiftTarget,
  updateMemberDisplayName,
  updateMemberAttributes,
} from "../firebase/members";
import { updateGroupSettings, updateShiftTypes } from "../firebase/settings";
import { cellStatesOf, parseSelKey, primaryCellState } from "../components/shiftVisual";
import type { BulkOp, CellState, SelKey } from "../components/shiftVisual";
import type { ShiftTheme } from "../components/shiftTheme";
import { describeWriteError } from "../utils/errorMessage";
import type {
  GroupSettings,
  Member,
  MemberRole,
  Shift,
  ShiftType,
  ShiftTypeDef,
} from "../types";

/** 1セル分の操作対象。選択キーから、その日のシフトと今の状態まで解決したもの。 */
export interface Target {
  memberId: string;
  dateKey: string;
  shifts: Shift[];
  state: CellState;
}

/** シフトの書き込み中に出す文面。通信のやり直しを促す点が通常の失敗と違う。 */
const RETRY_MESSAGE = "操作に失敗しました。通信状況を確認してもう一度お試しください。";

export interface Segment {
  id?: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
}

interface Options {
  groupId: string;
  uid: string;
  currentMember: Member;
  shifts: Shift[] | undefined;
  theme: ShiftTheme | null;
}

/**
 * シフトとメンバーへの書き込みをまとめて受け持つ。
 *
 * 書き込みはどれも「busy を立てる → 実行 → 失敗したら理由を出す → busy を下ろす」
 * という同じ形になる。画面側に散らすと、片方だけ busy を戻し忘れるような差が出る。
 * 成否は返り値で返し、ダイアログを閉じるかどうかは呼び出し側が決める。
 */
export function useShiftActions({ groupId, uid, currentMember, shifts, theme }: Options) {
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  /** 共通の実行の形。成功したら true。 */
  async function run(
    action: () => Promise<void>,
    message?: { denied?: string; failed?: string },
  ): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      setOpError(null);
      return true;
    } catch (err) {
      setOpError(describeWriteError(err, message));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function targetOf(key: SelKey): Target {
    const { memberId, dateKey } = parseSelKey(key);
    const found = (shifts ?? []).filter((s) => s.memberId === memberId && s.date === dateKey);
    const unavailableKeys = theme?.unavailableKeys ?? new Set<string>();
    return { memberId, dateKey, shifts: found, state: primaryCellState(cellStatesOf(found, unavailableKeys)) };
  }

  async function applyOps(targets: Target[], op: BulkOp): Promise<boolean> {
    return run(
      async () => {
        if (op.kind === "desired" || op.kind === "unavailable") {
          const type = op.type;
          const mine = targets.filter((t) => t.memberId === currentMember.id);
          const existing = mine.filter((t) => t.shifts.length > 0);
          const fresh = mine.filter((t) => t.shifts.length === 0);

          await Promise.all(
            existing.flatMap((t) => t.shifts.map((s) => updateShiftDetails(groupId, s.id, { type }))),
          );

          if (fresh.length > 0) {
            await createShiftsBulk({
              groupId,
              memberId: currentMember.id,
              dates: fresh.map((t) => t.dateKey),
              type,
              startTime: null,
              endTime: null,
              uid,
            });
          }
        } else if (op.kind === "clear") {
          const scope = targets.filter(
            (t) => t.memberId === currentMember.id && t.state.kind !== "fixed",
          );
          const ids = scope.flatMap((t) => t.shifts.map((s) => s.id));
          if (ids.length > 0) {
            await deleteShiftsBulk(groupId, ids);
          }
        } else if (op.kind === "reject") {
          const ids = targets
            .filter((t) => t.shifts.length > 0 && t.state.kind !== "fixed")
            .flatMap((t) => t.shifts.map((s) => s.id));
          await Promise.all(ids.map((id) => updateShiftDetails(groupId, id, { type: "却下" })));
        } else if (op.kind === "time") {
          const ids = targets.flatMap((t) => t.shifts.map((s) => s.id));
          await Promise.all(
            ids.map((id) =>
              updateShiftDetails(groupId, id, { startTime: op.startTime, endTime: op.endTime }),
            ),
          );
        } else if (op.kind === "confirm") {
          const ids = targets
            .filter((t) => t.state.kind === "want")
            .flatMap((t) => t.shifts.map((s) => s.id));
          await Promise.all(ids.map((id) => confirmShift(groupId, id, uid)));
        } else if (op.kind === "revert") {
          const ids = targets
            .filter((t) => t.state.kind === "fixed")
            .flatMap((t) => t.shifts.map((s) => s.id));
          await Promise.all(ids.map((id) => revertShiftToDesired(groupId, id)));
        }
      },
      {
        denied: "この操作を行う権限がありません（確定・却下は管理者とリーダーのみ）",
        failed: RETRY_MESSAGE,
      },
    );
  }

  /** その日のセグメントを、渡された内容そのものに合わせる（無くなったものは消す）。 */
  async function saveSegments(key: SelKey, next: Segment[]): Promise<boolean> {
    return run(
      async () => {
        const target = targetOf(key);
        const existing = new Set(target.shifts.map((s) => s.id));
        const nextIds = new Set(next.filter((n) => n.id).map((n) => n.id!));

        for (const seg of next) {
          if (seg.id) {
            await updateShiftDetails(groupId, seg.id, {
              type: seg.type as ShiftType,
              startTime: seg.startTime,
              endTime: seg.endTime,
            });
          } else {
            await createShiftsBulk({
              groupId,
              memberId: currentMember.id,
              dates: [target.dateKey],
              type: seg.type as ShiftType,
              startTime: seg.startTime,
              endTime: seg.endTime,
              uid,
            });
          }
        }

        const toDelete = [...existing].filter((id) => !nextIds.has(id));
        if (toDelete.length > 0) {
          await deleteShiftsBulk(groupId, toDelete);
        }
      },
      { failed: RETRY_MESSAGE },
    );
  }

  return {
    busy,
    opError,
    targetOf,
    applyOps,
    saveSegments,
    saveProfile: (displayName: string) =>
      run(() => updateMemberDisplayName(groupId, currentMember.id, displayName)),
    changeMemberRole: (memberId: string, role: MemberRole) =>
      run(() => updateMemberRole(groupId, memberId, role)),
    changeMemberShiftTarget: (memberId: string, shiftTarget: boolean) =>
      run(() => updateMemberShiftTarget(groupId, memberId, shiftTarget)),
    changeMemberActive: (memberId: string, active: boolean) =>
      run(() => updateMemberActive(groupId, memberId, active)),
    changeMemberDisplayName: (memberId: string, displayName: string) =>
      run(() => updateMemberDisplayName(groupId, memberId, displayName)),
    changeMemberAttributes: (memberId: string, attributes: string[]) =>
      run(() => updateMemberAttributes(groupId, memberId, attributes)),
    saveSettings: (patch: Partial<GroupSettings>) =>
      run(() => updateGroupSettings(groupId, patch)),
    saveShiftTypes: (types: ShiftTypeDef[]) => run(() => updateShiftTypes(groupId, types)),
  };
}
