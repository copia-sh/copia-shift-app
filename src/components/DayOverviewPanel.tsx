import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { Member, Shift } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { cellStatesOf, selKey, skinStyle, type SelKey } from "./shiftVisual";

export interface DayOverviewPanelProps {
  dateKey: string;
  members: Member[];
  shifts: Shift[];
  theme: ShiftTheme;
  currentMemberId: string;
  onOpenCell: (key: SelKey) => void;
  onClose: () => void;
  embedded?: boolean;
}

/**
 * 1日ぶんの全員。月や週で「＋n人」「＋n枠」に畳んだ内容は、必ずここから全部読める。
 * 畳んだ先が無いと、要約は情報を捨てたことになる。
 */
export function DayOverviewPanel({
  dateKey,
  members,
  shifts,
  theme,
  currentMemberId,
  onOpenCell,
  onClose,
  embedded = false,
}: DayOverviewPanelProps) {
  const date = new Date(`${dateKey}T00:00:00`);
  const rows = members.map((member) => ({
    member,
    states: cellStatesOf(
      shifts.filter((shift) => shift.memberId === member.id && shift.date === dateKey),
      theme.unavailableKeys,
    ),
  }));
  const answered = rows.filter((row) => row.states.length > 0).length;

  return (
    <div
      className={`flex max-h-full flex-col overflow-hidden ${
        embedded ? "" : "rounded-xl border border-[#E5E7EB] bg-white"
      }`}
    >
      {!embedded && (
        <div className="flex items-start justify-between border-b border-[#F1F3F5] px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <span className="text-[16px] font-bold text-[#111827]">
              {format(date, "M月d日（E）", { locale: ja })}
            </span>
            <span className="text-[14px] text-[#4B5563]">
              回答 {answered}人 ／ 未回答 {rows.length - answered}人
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-md border border-[#E5E7EB] text-[#374151] hover:bg-[#F0F0F0]"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col divide-y divide-[#F4F6F8] overflow-y-auto">
        {rows.map(({ member, states }) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onOpenCell(selKey(member.id, dateKey))}
            className="flex min-h-[52px] items-center gap-2.5 px-4 py-2 text-left hover:bg-[#FBFCFD]"
          >
            <span
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ backgroundColor: member.color }}
            />
            <span className="w-[104px] flex-none truncate text-[14px] font-bold text-[#111827]">
              {member.displayName}
              {member.id === currentMemberId && (
                <span className="ml-1 text-[12px] font-normal text-[#6B7280]">自分</span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {states.length === 0 ? (
                <span className="text-[13px] text-[#9CA3AF]">未回答</span>
              ) : (
                states.map((state, index) => {
                  const skin = theme.skinFor(state, false);
                  const def = theme.defOf(state.type);
                  return (
                    <span
                      key={index}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-[13px] font-bold"
                      style={skinStyle(skin)}
                    >
                      <span>{state.kind === "fixed" ? `${def.mark}✓` : skin.mark}</span>
                      <span>
                        {state.startTime && state.endTime
                          ? `${state.startTime}〜${state.endTime}`
                          : "終日"}
                      </span>
                    </span>
                  );
                })
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
