import { useState } from "react";
import type { Shift, ShiftType } from "../types";
import { TIME_CHOICES, validateSegments, skinStyle } from "./shiftVisual";
import type { ShiftTheme } from "./shiftTheme";
import { DIALOG_PRIMARY, MODAL_BACKDROP } from "./ui/controls";

export interface SegmentEditorProps {
  dateKey: string;
  memberName: string;
  segments: Shift[];
  theme: ShiftTheme;
  busy: boolean;
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
  maxSegments = 4,
  onClose,
  onSave,
}: SegmentEditorProps) {
  const [edits, setEdits] = useState<EditSegment[]>(
    segments.map((s) => ({
      id: s.id,
      type: s.type,
      startTime: s.startTime,
      endTime: s.endTime,
      isAllDay: !s.startTime && !s.endTime,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const canAdd = edits.length < maxSegments;

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
    <div className={MODAL_BACKDROP}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-ink">
            {dateKey} / {memberName}
          </h2>
        </div>

        <div className="mb-4 max-h-96 overflow-y-auto space-y-3">
          {edits.map((seg, idx) => {
            return (
              <div key={idx} className="flex items-center gap-2 rounded border border-line p-2">
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
                            : "bg-line-3 text-ink-3 hover:bg-line border-line-strong"
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
                  <span className="text-[11px] font-bold text-ink-2">終日</span>
                </label>

                {!seg.isAllDay && (
                  <>
                    <select
                      value={seg.startTime || "09:00"}
                      onChange={(e) => handleChangeStartTime(idx, e.target.value)}
                      disabled={seg.isAllDay}
                      className="px-1.5 py-1 text-[11px] border border-line-strong rounded bg-white"
                    >
                      {TIME_CHOICES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <span className="text-ink-5">〜</span>
                    <select
                      value={seg.endTime || "17:00"}
                      onChange={(e) => handleChangeEndTime(idx, e.target.value)}
                      disabled={seg.isAllDay}
                      className="px-1.5 py-1 text-[11px] border border-line-strong rounded bg-white"
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
                  className="ml-auto px-2 py-1 text-[11px] font-bold text-danger-text hover:bg-danger-wash rounded"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-wash border border-danger-line rounded text-[12px] font-bold text-danger-deep">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddSegment}
          disabled={!canAdd}
          className={`w-full mb-4 px-3 py-2 text-[12px] font-bold rounded ${
            canAdd
              ? "bg-brand-wash text-brand-press border border-brand-line hover:bg-brand-tint"
              : "bg-line-3 text-ink-5 cursor-not-allowed"
          }`}
        >
          ＋枠を追加
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-line-strong rounded bg-white text-ink-2 hover:bg-surface-4"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className={DIALOG_PRIMARY}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
