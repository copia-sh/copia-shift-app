import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { Shift } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { cellStatesOf } from "./shiftVisual";
import type { TemplateSegment } from "../utils/applyTemplate";

export interface MultiDayApplyPanelProps {
  /** 適用する内容 */
  segments: TemplateSegment[];
  /** 選べる日（表示中の期間） */
  days: Date[];
  shiftsByDate: ReadonlyMap<string, Shift[]>;
  selectedDates: ReadonlySet<string>;
  theme: ShiftTheme;
  onToggleDate: (dateKey: string) => void;
}

/**
 * 同じ内容を複数日へ適用するときの日選び。
 * 確定済みの日は選べないようにし、理由をその場に書く（選べたのに反映されない、を作らない）。
 */
export function MultiDayApplyPanel({
  segments,
  days,
  shiftsByDate,
  selectedDates,
  theme,
  onToggleDate,
}: MultiDayApplyPanelProps) {
  const summary = segments
    .map((segment) => {
      const label = theme.defOf(segment.type).label;
      return segment.startTime && segment.endTime
        ? `${label} ${segment.startTime}〜${segment.endTime}`
        : `${label} 終日`;
    })
    .join(" / ");

  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-md border border-[#E5E7EB] bg-[#FBFCFD] px-3 py-2 text-[13px] font-bold text-[#374151]">
        適用する内容: {summary || "（枠なし）"}
      </p>

      <div className="flex flex-col gap-1.5">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const existing = shiftsByDate.get(dateKey) ?? [];
          const locked = existing.some((shift) => shift.status === "confirmed");
          const states = cellStatesOf(existing, theme.unavailableKeys);
          const checked = selectedDates.has(dateKey);
          const current = locked
            ? "確定済み"
            : states.length === 0
              ? "未回答"
              : states
                  .map((state) =>
                    state.startTime && state.endTime
                      ? `${state.startTime}〜${state.endTime}`
                      : "終日",
                  )
                  .join(" / ");

          return (
            <button
              key={dateKey}
              type="button"
              disabled={locked}
              onClick={() => onToggleDate(dateKey)}
              aria-pressed={checked}
              className={`flex min-h-[52px] items-center gap-2.5 rounded-md border px-3 text-left ${
                checked ? "border-[#248DD4] bg-[#F4FAFE]" : "border-[#E5E7EB] bg-white"
              } ${locked ? "cursor-default" : ""}`}
            >
              <span
                className="flex h-6 w-6 flex-none items-center justify-center rounded-md border-2 text-[14px] font-bold text-white"
                style={{
                  borderColor: checked ? "#248DD4" : "#C8CDD2",
                  background: checked ? "#248DD4" : "#fff",
                }}
              >
                {checked ? "✓" : ""}
              </span>
              <span className="text-[14px] font-bold text-[#111827]">
                {format(day, "M月d日（E）", { locale: ja })}
              </span>
              <span className="ml-auto flex-none text-[12px] font-bold text-[#6B7280]">
                {current}
              </span>
              {locked && (
                <span className="flex-none rounded-full bg-[#F4F6F8] px-2 py-0.5 text-[12px] font-bold text-[#4B5563]">
                  編集不可
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
