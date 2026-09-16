import { useState } from "react";
import type { Shift, ShiftType } from "../types";
import { TIME_CHOICES, validateSegments, skinStyle } from "./shiftVisual";
import type { ShiftTheme } from "./shiftTheme";

export interface SegmentEditorProps {
  dateKey: string;
  memberName: string;
  segments: Shift[];
  theme: ShiftTheme;
  busy: boolean;
  /** 保存に失敗したときの理由。入力を保ったままこのダイアログ内に出す */
  error?: string | null;
  maxSegments?: number;
  onClose: () => void;
  onSave: (
    next: { id?: string; type: ShiftType; startTime: string | null; endTime: string | null }[]
  ) => void;
}

interface EditSegment {
  id?: string;
  type: ShiftType;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
}

export function SegmentEditor({
  dateKey,
  memberName,
  segments,
  theme,
  busy,
  error: saveError = null,
  maxSegments = 4,
  onClose,
  onSave,
}: SegmentEditorProps) {
  // 確定済みの枠はここでは編集しない（確定の取消が先）。ただし読めるようにする。
  const confirmed = segments.filter((s) => s.status === "confirmed");
  const [edits, setEdits] = useState<EditSegment[]>(
    segments
      .filter((s) => s.status !== "confirmed")
      .map((s) => ({
        id: s.id,
        type: s.type,
        startTime: s.startTime,
        endTime: s.endTime,
        isAllDay: !s.startTime && !s.endTime,
      }))
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const setError = setValidationError;
  // 入力の誤りと保存の失敗は、同じ場所にまとめて出す。
  const error = validationError ?? saveError;
  const canAdd = confirmed.length + edits.length < maxSegments;

  const handleAddSegment = () => {
    if (canAdd) {
      const defaultType = theme.types[0]?.key ?? "出勤";
      setEdits([...edits, { type: defaultType, startTime: "09:00", endTime: "17:00", isAllDay: false }]);
      setError(null);
    }
  };

  const handleRemoveSegment = (index: number) => {
    setEdits(edits.filter((_, i) => i !== index));
    setError(null);
  };

  /** 1行だけを差し替えた新しい配列を返す（既存の行オブジェクトは書き換えない）。 */
  const patchRow = (index: number, patch: Partial<(typeof edits)[number]>) => {
    setEdits(edits.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setError(null);
  };

  const handleChangeType = (index: number, type: ShiftType) => patchRow(index, { type });

  const handleChangeAllDay = (index: number, isAllDay: boolean) =>
    patchRow(
      index,
      isAllDay
        ? { isAllDay, startTime: null, endTime: null }
        : { isAllDay, startTime: "09:00", endTime: "17:00" },
    );

  const handleChangeStartTime = (index: number, value: string) =>
    patchRow(index, { startTime: value });

  const handleChangeEndTime = (index: number, value: string) =>
    patchRow(index, { endTime: value });

  const handleSave = () => {
    const toValidate = edits.map((e) => ({
      startTime: e.startTime,
      endTime: e.endTime,
    }));
    const validationError = validateSegments(toValidate, maxSegments);
    if (validationError) {
      setError(validationError);
      return;
    }

    const result = edits.map((e) => ({
      id: e.id,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
    }));
    onSave(result);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {dateKey} / {memberName}
          </h2>
        </div>

        {confirmed.length > 0 && (
          <div className="mb-3 space-y-1 rounded border border-gray-200 bg-[#FBFCFD] p-2">
            <p className="text-[11px] font-bold text-gray-500">確定済み（ここでは編集できません）</p>
            {confirmed.map((s) => (
              <p key={s.id} className="text-[12px] font-bold text-gray-800">
                {theme.defOf(s.type).label} ・{" "}
                {s.startTime && s.endTime ? `${s.startTime}〜${s.endTime}` : "終日"}
              </p>
            ))}
          </div>
        )}

        <div className="mb-4 max-h-96 overflow-y-auto space-y-3">
          {edits.map((seg, idx) => {
            return (
              <div key={idx} className="flex items-center gap-2 rounded border border-gray-200 p-2">
                <div className="flex gap-1">
                  {theme.types.map((typeDef) => {
                    const sk = theme.skinFor({ kind: "want", type: typeDef.key, startTime: null, endTime: null }, seg.type === typeDef.key);
                    return (
                      <button
                        key={typeDef.key}
                        type="button"
                        onClick={() => handleChangeType(idx, typeDef.key)}
                        className={`px-2 py-1 text-[11px] font-bold rounded border ${
                          seg.type === typeDef.key
                            ? ""
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-300"
                        }`}
                        style={
                          seg.type === typeDef.key
                            ? skinStyle(sk)
                            : {}
                        }
                      >
                        {typeDef.label.slice(0, 1)}
                      </button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-1 ml-auto">
                  <input
                    type="checkbox"
                    checked={seg.isAllDay}
                    onChange={(e) => handleChangeAllDay(idx, e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-[11px] font-bold text-gray-700">終日</span>
                </label>

                {!seg.isAllDay && (
                  <>
                    <select
                      value={seg.startTime || "09:00"}
                      onChange={(e) => handleChangeStartTime(idx, e.target.value)}
                      disabled={seg.isAllDay}
                      className="px-1.5 py-1 text-[11px] border border-gray-300 rounded bg-white"
                    >
                      {TIME_CHOICES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-400">〜</span>
                    <select
                      value={seg.endTime || "17:00"}
                      onChange={(e) => handleChangeEndTime(idx, e.target.value)}
                      disabled={seg.isAllDay}
                      className="px-1.5 py-1 text-[11px] border border-gray-300 rounded bg-white"
                    >
                      {TIME_CHOICES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveSegment(idx)}
                  className="ml-auto px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-[12px] font-bold text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddSegment}
          disabled={!canAdd}
          className={`w-full mb-4 px-3 py-2 text-[12px] font-bold rounded ${
            canAdd
              ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          ＋枠を追加
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-[#248DD4] rounded bg-[#248DD4] text-white hover:bg-[#1B6FA8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
