import { useState } from "react";
import { SHIFT_TYPES, SHIFT_TYPE_STYLE } from "../types";
import type { Member, ShiftEntry, ShiftType } from "../types";
import { timeOptions } from "../utils/date";

interface ShiftDetailPopoverProps {
  entry: ShiftEntry;
  member: Member;
  isOwnEntry: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRevert: () => void;
  onDelete: () => void;
  onUpdateDetails: (updates: {
    type?: ShiftType;
    startTime?: string | null;
    endTime?: string | null;
  }) => void;
}

const TIME_OPTIONS = timeOptions();

export function ShiftDetailPopover({
  entry,
  member,
  isOwnEntry,
  busy,
  onClose,
  onConfirm,
  onRevert,
  onDelete,
  onUpdateDetails,
}: ShiftDetailPopoverProps) {
  const [startTime, setStartTime] = useState(entry.startTime ?? "");
  const [endTime, setEndTime] = useState(entry.endTime ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{entry.date}</p>
            <h2 className="text-lg font-semibold text-gray-900">{member.name}</h2>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: entry.status === "confirmed" ? "#dcfce7" : "#f3f4f6",
              color: entry.status === "confirmed" ? "#166534" : "#4b5563",
            }}
          >
            {entry.status === "confirmed" ? "確定" : "希望"}
          </span>
        </div>

        <div className="mb-3 flex gap-1">
          {SHIFT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              disabled={busy}
              onClick={() => onUpdateDetails({ type })}
              className="rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50"
              style={{
                backgroundColor: SHIFT_TYPE_STYLE[type].bg,
                color: SHIFT_TYPE_STYLE[type].text,
                border:
                  entry.type === type
                    ? "2px solid #111827"
                    : "1px solid #e5e7eb",
              }}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <select
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            onBlur={() => onUpdateDetails({ startTime: startTime || null })}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">--:--</option>
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
            onBlur={() => onUpdateDetails({ endTime: endTime || null })}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">--:--</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {entry.status === "desired" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              確定する
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onRevert}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              確定を取り消す
            </button>
          )}
          {isOwnEntry && entry.status === "desired" && (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              削除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
