import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { Shift } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { buildIcalendar, shiftsToIcalEvents } from "../utils/ical";

export interface ExportDialogProps {
  anchorDate: Date;
  shifts: Shift[];
  currentMemberId: string;
  theme: ShiftTheme;
  busy: boolean;
  onClose: () => void;
}

export function ExportDialog({
  anchorDate,
  shifts,
  currentMemberId,
  theme,
  busy,
  onClose,
}: ExportDialogProps) {
  const [includeUnavailable, setIncludeUnavailable] = useState(false);

  const handleExport = () => {
    // Get target month (YYYY-MM format)
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth() + 1;
    const monthStr = String(month).padStart(2, "0");
    const targetMonth = `${year}-${monthStr}`;

    // Filter shifts: current member only, target month only
    const targetShifts = shifts.filter((shift) => {
      return (
        shift.memberId === currentMemberId && shift.date.startsWith(targetMonth)
      );
    });

    // Convert to iCal events
    const events = shiftsToIcalEvents({
      shifts: targetShifts,
      labelOf: (typeKey) => theme.defOf(typeKey).label,
      isUnavailable: (typeKey) => theme.unavailableKeys.has(typeKey),
      includeUnavailable,
    });

    // Generate iCalendar string
    const monthLabel = format(anchorDate, "yyyy年M月", { locale: ja });
    const ics = buildIcalendar(events, {
      calendarName: `Copia ${monthLabel}`,
    });

    // Create blob and download
    const blob = new Blob([ics], { type: "text/calendar; charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `copia-shift-${year}-${monthStr}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    onClose();
  };

  const monthLabel = format(anchorDate, "yyyy年M月", { locale: ja });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">シフトの書き出し</h2>
        </div>

        <div className="mb-6">
          <p className="text-sm text-gray-600">
            {monthLabel}のあなたのシフトを書き出します
          </p>
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeUnavailable}
              onChange={(e) => setIncludeUnavailable(e.target.checked)}
              disabled={busy}
              className="w-4 h-4 rounded border border-gray-300 text-[#248DD4] focus:ring-[#248DD4] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-medium text-gray-700">
              出られない予定も含める（欠勤・却下など）
            </span>
          </label>
        </div>

        <div className="mb-6">
          <p className="text-xs text-gray-500">
            カレンダーアプリに取り込めるファイル(.ics)を保存します
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-[#248DD4] rounded bg-[#248DD4] text-white hover:bg-[#1B6FA8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            書き出す
          </button>
        </div>
      </div>
    </div>
  );
}
