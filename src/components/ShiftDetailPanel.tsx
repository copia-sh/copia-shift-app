import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { Member, Shift } from "../types";
import { REJECTED_TYPE } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { cellStatesOf, type CellState } from "./shiftVisual";

export interface ShiftDetailPanelProps {
  dateKey: string;
  member: Member;
  isCurrentMember: boolean;
  shifts: Shift[];
  theme: ShiftTheme;
  canEdit: boolean;
  /** 編集できない理由。canEdit が false のときは必ず渡す */
  lockReason?: string | null;
  onEdit: () => void;
  onShowWholeDay?: () => void;
  onClose: () => void;
  /** シートの中に置くとき。見出しとボタンはシート側が持つ */
  embedded?: boolean;
}

/** 状態バッジ。色だけでなく文字でも「確定/希望/不可/却下」を示す。 */
function statusBadge(state: CellState): { label: string; className: string } {
  if (state.kind === "fixed") {
    return { label: "確定", className: "bg-[#D1E9F9] text-[#0863A0]" };
  }
  if (state.type === REJECTED_TYPE) {
    return { label: "却下", className: "bg-[#FFF6D6] text-[#8A5310]" };
  }
  if (state.kind === "no") {
    return { label: "不可", className: "bg-[#F4F6F8] text-[#4B5563]" };
  }
  return { label: "希望", className: "bg-[#F4F6F8] text-[#374151]" };
}

function formatStamp(millis: number | null): string | null {
  return millis ? format(new Date(millis), "M/dd HH:mm", { locale: ja }) : null;
}

/**
 * 1メンバー×1日の詳細。タップで開くのはこれで、ここでは何も書き込まない。
 * 編集できない枠も同じ濃さで読めるようにする（不透明度を下げて隠さない）。
 */
export function ShiftDetailPanel({
  dateKey,
  member,
  isCurrentMember,
  shifts,
  theme,
  canEdit,
  lockReason,
  onEdit,
  onShowWholeDay,
  onClose,
  embedded = false,
}: ShiftDetailPanelProps) {
  const date = new Date(`${dateKey}T00:00:00`);
  const states = cellStatesOf(shifts, theme.unavailableKeys);

  // 現在値の時刻から分かる範囲だけを出す。変更履歴そのものは持っていないので、
  // 「いつ登録され、いつ確定したか」に限る（推測で埋めない）。
  const history = shifts
    .flatMap((shift) => {
      const rows: { at: number; text: string }[] = [];
      if (shift.createdAt) {
        rows.push({ at: shift.createdAt, text: `${theme.defOf(shift.type).label} の希望を登録` });
      }
      if (shift.confirmedAt) {
        rows.push({ at: shift.confirmedAt, text: `${theme.defOf(shift.type).label} を確定` });
      }
      return rows;
    })
    .sort((a, b) => a.at - b.at);

  return (
    <div className={`flex max-h-full flex-col overflow-hidden ${embedded ? "" : "rounded-xl border border-[#E5E7EB] bg-white"}`}>
      {!embedded && (
      <div className="flex items-start justify-between border-b border-[#F1F3F5] px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[16px] font-bold text-[#111827]">
            {format(date, "M月d日（E）", { locale: ja })}
          </span>
          <span className="truncate text-[14px] text-[#4B5563]">
            {member.displayName}
            {isCurrentMember ? "（自分）" : member.attributes[0] ? `（${member.attributes[0]}）` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="詳細を閉じる"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-md border border-[#E5E7EB] text-[#374151] hover:bg-[#F0F0F0]"
        >
          ✕
        </button>
      </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {!canEdit && lockReason && (
          <div className="flex flex-col gap-1 rounded-md border border-[#E5E7EB] bg-[#FBFCFD] px-3 py-2.5">
            <span className="text-[14px] font-bold text-[#111827]">編集できません</span>
            <span className="text-[13px] leading-[1.6] text-[#374151]">{lockReason}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-[#6B7280]">時間枠 {states.length}件</span>
          {states.length === 0 && (
            <p className="rounded-md border border-dashed border-[#E3E3E3] px-3 py-3 text-center text-[13px] text-[#6B7280]">
              まだ希望が登録されていません
            </p>
          )}
          {states.map((state, index) => {
            const skin = theme.skinFor(state, false);
            const badge = statusBadge(state);
            const def = theme.defOf(state.type);
            return (
              <div
                key={state.shift?.id ?? index}
                className="flex items-center gap-2.5 rounded-md border border-[#EFF1F3] px-3 py-2.5"
              >
                <span
                  className="flex h-5 w-[26px] flex-none items-center justify-center rounded text-[12px] font-bold"
                  style={{
                    backgroundColor: skin.bg,
                    borderColor: skin.border,
                    borderStyle: skin.borderStyle,
                    borderWidth: skin.borderWidth,
                    color: skin.fg,
                  }}
                >
                  {state.kind === "fixed" ? `${def.mark}✓` : skin.mark}
                </span>
                <span className="text-[14px] font-bold text-[#111827]">
                  {state.startTime && state.endTime
                    ? `${state.startTime}〜${state.endTime}`
                    : "終日"}
                </span>
                <span className="truncate text-[14px] text-[#4B5563]">{def.label}</span>
                <span
                  className={`ml-auto flex-none rounded-full px-2 py-0.5 text-[12px] font-bold ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>

        {history.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-[#6B7280]">この日の記録</span>
            <div className="text-[13px] leading-[1.6] text-[#4B5563]">
              {history.map((row, index) => (
                <div key={index}>
                  {formatStamp(row.at)}　{row.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!embedded && (
      <div className="flex gap-2 border-t border-[#F1F3F5] px-4 py-3.5">
        {onShowWholeDay && (
          <button
            type="button"
            onClick={onShowWholeDay}
            className="h-[38px] rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[14px] font-bold text-[#374151] shadow-[0_2px_0_0_#E3E3E3] active:translate-y-0.5 active:shadow-none"
          >
            この日の全員を見る
          </button>
        )}
        {/* 押せない「編集」も消さずに残す。無いと、権限が無いのか壊れているのか分からない。 */}
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          title={canEdit ? undefined : (lockReason ?? "この枠は編集できません")}
          className="ml-auto h-[38px] rounded-md border border-[#248DD4] bg-[#248DD4] px-5 text-[14px] font-bold text-white shadow-[0_2px_0_0_#0863A0] active:translate-y-0.5 active:shadow-none disabled:border-[#F4F6F8] disabled:bg-[#F4F6F8] disabled:text-[#9CA3AF] disabled:shadow-none"
        >
          編集
        </button>
      </div>
      )}
    </div>
  );
}
