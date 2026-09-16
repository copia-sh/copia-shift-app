import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { ShiftType } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { TIME_CHOICES } from "./shiftVisual";
import type { DaySegmentInput } from "./shiftOps";

export interface ShiftEditFormProps {
  dateKey: string;
  memberName: string;
  isCurrentMember: boolean;
  draft: DaySegmentInput[];
  /** 編集できない確定済みの枠。件数だけ数えて上限に含める */
  lockedCount: number;
  maxSegments: number;
  theme: ShiftTheme;
  saving: boolean;
  error?: string | null;
  changedCount: number;
  onChange: (next: DaySegmentInput[]) => void;
  onSave: () => void;
  onCancel: () => void;
  /** 繰り返し入力を減らす入口（よく使う型・先週のコピー・複数日適用） */
  shortcuts?: { key: string; label: string; onApply: () => void }[];
  /** シートの中に置くとき。見出しとボタンはシート側が持つ */
  embedded?: boolean;
}

const ALL_DAY = "終日";

/**
 * 1日分の枠を編集する。保存を押すまで書き込まない。
 * 種別・時間・保存は縦に並べる（6種別と時刻を横1行へ押し込むと、狭い端末で潰れる）。
 */
export function ShiftEditForm({
  dateKey,
  memberName,
  isCurrentMember,
  draft,
  lockedCount,
  maxSegments,
  theme,
  saving,
  error = null,
  changedCount,
  onChange,
  onSave,
  onCancel,
  shortcuts = [],
  embedded = false,
}: ShiftEditFormProps) {
  // 枠が増えても縦に伸び続けないよう、開いている枠は1つに絞る。
  const [openIndex, setOpenIndex] = useState(0);
  const date = new Date(`${dateKey}T00:00:00`);
  const remaining = maxSegments - lockedCount - draft.length;

  const patch = (index: number, next: Partial<DaySegmentInput>) =>
    onChange(draft.map((row, i) => (i === index ? { ...row, ...next } : row)));

  const remove = (index: number) => {
    onChange(draft.filter((_, i) => i !== index));
    setOpenIndex((current) => (current >= index ? Math.max(0, current - 1) : current));
  };

  const add = () => {
    const defaultType = theme.types[0]?.key ?? "出勤";
    onChange([...draft, { type: defaultType, startTime: "09:00", endTime: "17:00" }]);
    setOpenIndex(draft.length);
  };

  return (
    <div className={`flex max-h-full flex-col overflow-hidden ${embedded ? "" : "rounded-xl border border-[#248DD4] bg-white shadow-[0_2px_4px_rgba(36,141,212,0.2)]"}`}>
      {!embedded && (
      <div className="flex items-start justify-between border-b border-[#F1F3F5] px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[16px] font-bold text-[#111827]">
            {format(date, "M月d日（E）", { locale: ja })}を編集
          </span>
          <span className="truncate text-[14px] text-[#4B5563]">
            {memberName}
            {isCurrentMember ? "（自分）" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="編集をやめる"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-md border border-[#E5E7EB] text-[#374151] hover:bg-[#F0F0F0]"
        >
          ✕
        </button>
      </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3">
        {draft.length === 0 && (
          <p className="rounded-md border border-dashed border-[#E3E3E3] px-3 py-4 text-center text-[13px] text-[#6B7280]">
            枠がありません。「＋ 枠を追加」で希望を入力してください。
          </p>
        )}

        {draft.map((row, index) => {
          const def = theme.defOf(row.type);
          const isAllDay = !row.startTime && !row.endTime;
          const open = index === openIndex;
          const skin = theme.skinFor(
            { kind: "want", type: row.type, startTime: null, endTime: null },
            false,
          );

          if (!open) {
            return (
              <div key={index} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#6B7280]">{index + 1}枠目</span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={saving}
                    className="text-[12px] text-[#248DD4] underline disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-[#EFF1F3] px-2.5 py-2">
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
                    {def.mark}
                  </span>
                  <span className="text-[14px] font-bold text-[#111827]">
                    {isAllDay ? ALL_DAY : `${row.startTime}〜${row.endTime}`}
                  </span>
                  <span className="truncate text-[14px] text-[#4B5563]">{def.label}</span>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(index)}
                    className="ml-auto flex-none text-[13px] text-[#248DD4] underline"
                  >
                    開く
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#6B7280]">{index + 1}枠目</span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={saving}
                  className="text-[12px] text-[#248DD4] underline disabled:opacity-50"
                >
                  削除
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-[#4B5563]">種別</span>
                <div className="flex flex-wrap gap-1.5">
                  {theme.types.map((typeDef) => {
                    const selected = typeDef.key === row.type;
                    return (
                      <button
                        key={typeDef.key}
                        type="button"
                        onClick={() => patch(index, { type: typeDef.key as ShiftType })}
                        disabled={saving}
                        aria-pressed={selected}
                        className={`flex min-h-[44px] items-center gap-1.5 rounded-md px-3 font-bold disabled:opacity-50 md:h-[38px] md:min-h-0 ${
                          selected
                            ? "border-2 border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]"
                            : "border border-[#E5E7EB] bg-white text-[#374151]"
                        }`}
                      >
                        <span className="text-[13px]">{typeDef.mark}</span>
                        <span className="text-[14px]">{typeDef.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  disabled={saving}
                  onChange={(event) =>
                    patch(
                      index,
                      event.target.checked
                        ? { startTime: null, endTime: null }
                        : { startTime: "09:00", endTime: "17:00" },
                    )
                  }
                  className="h-4 w-4"
                />
                <span className="text-[14px] text-[#374151]">終日</span>
              </label>

              {!isAllDay && (
                <div className="flex gap-2.5">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[12px] text-[#4B5563]">開始時刻</span>
                    <select
                      value={row.startTime ?? "09:00"}
                      disabled={saving}
                      onChange={(event) => patch(index, { startTime: event.target.value })}
                      className="h-11 rounded-md border border-[#E5E7EB] px-2.5 text-[16px] font-bold text-[#111827]"
                    >
                      {TIME_CHOICES.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[12px] text-[#4B5563]">終了時刻</span>
                    <select
                      value={row.endTime ?? "17:00"}
                      disabled={saving}
                      onChange={(event) => patch(index, { endTime: event.target.value })}
                      className="h-11 rounded-md border border-[#E5E7EB] px-2.5 text-[16px] font-bold text-[#111827]"
                    >
                      {TIME_CHOICES.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}

        {shortcuts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-[#E5E7EB] bg-[#FBFCFD] px-3 py-2.5">
            {/* タップ即保存をやめた分、同じ内容を選び直す手数が増える。
                よく使う組み合わせを1タップで埋められるようにする。 */}
            <span className="text-[12px] font-bold text-[#6B7280]">手数を減らす</span>
            <div className="flex flex-wrap gap-1.5">
              {shortcuts.map((shortcut) => (
                <button
                  key={shortcut.key}
                  type="button"
                  onClick={shortcut.onApply}
                  disabled={saving}
                  className="flex h-[34px] items-center rounded-md border border-[#E5E7EB] bg-white px-2.5 text-[13px] font-bold text-[#374151] disabled:opacity-50"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={add}
            disabled={saving || remaining <= 0}
            className="flex h-[38px] items-center rounded-md border border-dashed border-[#248DD4] bg-white px-3.5 text-[14px] font-bold text-[#0863A0] disabled:border-[#E5E7EB] disabled:text-[#9CA3AF]"
          >
            ＋ 枠を追加
          </button>
          <span className="text-[12px] text-[#6B7280]">
            あと{Math.max(0, remaining)}枠（最大{maxSegments}枠）
            {lockedCount > 0 && `・確定済み${lockedCount}枠を含む`}
          </span>
        </div>
      </div>

      {error && (
        <p
          aria-live="polite"
          className="mx-4 rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-3 py-2 text-[13px] font-bold text-[#D9736F]"
        >
          {error}
        </p>
      )}

      {!embedded && (
      <div className="flex items-center gap-2 border-t border-[#F1F3F5] px-4 py-3.5">
        <button
          type="button"
          data-autofocus
          onClick={onSave}
          disabled={saving}
          className="h-[38px] rounded-md bg-[#248DD4] px-5 text-[14px] font-bold text-white shadow-[0_2px_0_0_#0863A0] active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-[38px] rounded-md border border-[#E5E7EB] bg-white px-3.5 text-[14px] text-[#374151] shadow-[0_2px_0_0_#E3E3E3] active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        >
          取消
        </button>
        <span className="ml-auto text-[12px] text-[#6B7280]">
          {changedCount > 0 ? `未保存の変更 ${changedCount}件` : "変更なし"}
        </span>
      </div>
      )}
    </div>
  );
}
