import { useState } from "react";
import { SHIFT_TYPES, SHIFT_TYPE_STYLE } from "../types";
import type { ShiftType } from "../types";
import { timeOptions } from "../utils/date";

interface CreateShiftModalProps {
  dateKey: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (params: {
    type: ShiftType;
    startTime: string | null;
    endTime: string | null;
  }) => void;
}

const TIME_OPTIONS = timeOptions();

export function CreateShiftModal({
  dateKey,
  busy,
  onClose,
  onCreate,
}: CreateShiftModalProps) {
  const [type, setType] = useState<ShiftType>("出勤");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          {dateKey} の出勤希望を登録
        </h2>

        <div className="mb-3 flex gap-1">
          {SHIFT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: SHIFT_TYPE_STYLE[t].bg,
                color: SHIFT_TYPE_STYLE[t].text,
                border: type === t ? "2px solid #111827" : "1px solid #e5e7eb",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <select
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="text-gray-400">〜</span>
          <select
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCreate({ type, startTime, endTime })}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            登録
          </button>
        </div>
      </div>
    </div>
  );
}
