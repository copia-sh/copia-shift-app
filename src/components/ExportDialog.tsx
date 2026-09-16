import { useMemo, useState } from "react";
import { Dialog } from "./Dialog";
import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { REJECTED_TYPE } from "../types";
import type { ShiftTheme } from "./shiftTheme";
import { useShiftsInRange } from "../hooks/useShifts";
import {
  buildIcalendar,
  filterShiftsForExport,
  shiftsToSpreadsheetRow,
  shiftsToIcalEvents,
  type ExportShiftStatus,
} from "../utils/ical";
import { toDateKey } from "../utils/date";

type PeriodPreset = "month" | "twoMonths" | "threeMonths" | "custom";
type StatusPreset = "all" | "confirmed" | "desired";
type ExportMethod = "calendar" | "spreadsheet";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) throw new Error("copy failed");
  }
}

export interface ExportDialogProps {
  anchorDate: Date;
  groupId: string;
  currentMemberId: string;
  theme: ShiftTheme;
  busy: boolean;
  onClose: () => void;
}

export function ExportDialog({
  anchorDate,
  groupId,
  currentMemberId,
  theme,
  busy,
  onClose,
}: ExportDialogProps) {
  const monthStart = toDateKey(startOfMonth(anchorDate));
  const monthEnd = toDateKey(endOfMonth(anchorDate));
  const [method, setMethod] = useState<ExportMethod>("calendar");
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [customStart, setCustomStart] = useState(monthStart);
  const [customEnd, setCustomEnd] = useState(monthEnd);
  const [status, setStatus] = useState<StatusPreset>("all");
  const [selectedTypeKeys, setSelectedTypeKeys] = useState<Set<string>>(
    () => new Set(theme.types.filter((type) => type.attendance === "available").map((type) => type.key)),
  );
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    if (period === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }
    const months = period === "month" ? 1 : period === "twoMonths" ? 2 : 3;
    return {
      startDate: monthStart,
      endDate: toDateKey(endOfMonth(addMonths(anchorDate, months - 1))),
    };
  }, [anchorDate, customEnd, customStart, monthStart, period]);

  const invalidRange = !startDate || !endDate || startDate > endDate;
  const { shifts, error: shiftsError } = useShiftsInRange(invalidRange ? null : groupId, startDate, endDate);
  const typeOptions = useMemo(() => {
    const options = [...theme.types];
    const keys = new Set(options.map((type) => type.key));
    if (!keys.has(REJECTED_TYPE)) options.push(theme.defOf(REJECTED_TYPE));
    return options;
  }, [theme]);

  const selectedStatuses = useMemo<Set<ExportShiftStatus>>(() => {
    if (status === "all") return new Set(["desired", "confirmed"]);
    return new Set([status]);
  }, [status]);

  const targetShifts = useMemo(
    () =>
      invalidRange || !shifts
        ? []
        : filterShiftsForExport({
            shifts,
            memberId: currentMemberId,
            startDate,
            endDate,
            typeKeys: selectedTypeKeys,
            statuses: selectedStatuses,
          }),
    [currentMemberId, endDate, invalidRange, selectedStatuses, selectedTypeKeys, shifts, startDate],
  );

  const toggleType = (key: string) => {
    setCopied(false);
    setCopyError(false);
    setSelectedTypeKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    if (method === "spreadsheet") {
      const row = shiftsToSpreadsheetRow({
        shifts: targetShifts,
        year: anchorDate.getFullYear(),
        month: anchorDate.getMonth() + 1,
        labelOf: (typeKey) => theme.defOf(typeKey).label,
      });
      try {
        await copyText(row.join("\t"));
        setCopied(true);
        setCopyError(false);
      } catch {
        setCopied(false);
        setCopyError(true);
      }
      return;
    }

    const events = shiftsToIcalEvents({
      shifts: targetShifts,
      labelOf: (typeKey) => theme.defOf(typeKey).label,
      isUnavailable: () => false,
      includeUnavailable: true,
    });

    const rangeLabel =
      startDate === monthStart && endDate === monthEnd
        ? format(anchorDate, "yyyy年M月", { locale: ja })
        : `${format(parseISO(startDate), "yyyy年M月d日", { locale: ja })}〜${format(parseISO(endDate), "yyyy年M月d日", { locale: ja })}`;
    const ics = buildIcalendar(events, {
      calendarName: `Copia ${rangeLabel}`,
    });

    const blob = new Blob([ics], { type: "text/calendar; charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `copia-shift-${startDate}_${endDate}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    onClose();
  };

  const isLoading = shifts === undefined;
  const canExport =
    !busy &&
    !isLoading &&
    !shiftsError &&
    !invalidRange &&
    selectedTypeKeys.size > 0 &&
    targetShifts.length > 0;

  return (
    <Dialog title="シフトを書き出す" onClose={onClose}>


        <fieldset className="mb-5">
          <legend className="mb-1.5 text-sm font-bold text-gray-800">出力方法</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["calendar", "カレンダー", ".icsファイル"],
              ["spreadsheet", "Excel貼り付け", "1日から1行"],
            ] as const).map(([value, label, note]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border px-3 py-2.5 ${
                  method === value ? "border-[#248DD4] bg-blue-50" : "border-gray-200 bg-white"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <input
                    type="radio"
                    name="export-method"
                    value={value}
                    checked={method === value}
                    onChange={() => {
                      setMethod(value);
                      if (value === "spreadsheet") setPeriod("month");
                      setCopied(false);
                      setCopyError(false);
                    }}
                    disabled={busy}
                    className="h-4 w-4 border-gray-300 text-[#248DD4] focus:ring-[#248DD4]"
                  />
                  {label}
                </span>
                <span className="mt-1 block pl-6 text-xs text-gray-500">{note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-5">
          <label htmlFor="export-period" className="mb-1.5 block text-sm font-bold text-gray-800">
            期間
          </label>
          {method === "calendar" ? (
            <select
              id="export-period"
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodPreset)}
              disabled={busy}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-[#248DD4] focus:outline-none"
            >
              <option value="month">表示中の月（{format(anchorDate, "yyyy年M月", { locale: ja })}）</option>
              <option value="twoMonths">表示中の月から2か月</option>
              <option value="threeMonths">表示中の月から3か月</option>
              <option value="custom">日付を指定</option>
            </select>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              表示中の月（{format(anchorDate, "yyyy年M月", { locale: ja })}）
            </div>
          )}

          {method === "calendar" && period === "custom" && (
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="text-xs font-medium text-gray-600">
                開始日
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-800"
                />
              </label>
              <span className="pb-2 text-gray-400">〜</span>
              <label className="text-xs font-medium text-gray-600">
                終了日
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-800"
                />
              </label>
            </div>
          )}
          {invalidRange && <p className="mt-2 text-xs font-medium text-red-600">終了日は開始日以降にしてください</p>}
        </div>

        <details className="mb-5 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
          <summary className="cursor-pointer text-sm font-bold text-gray-800">詳細設定</summary>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-gray-700">予定の種類</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {typeOptions.map((type) => (
                <label key={type.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedTypeKeys.has(type.key)}
                    onChange={() => toggleType(type.key)}
                    disabled={busy}
                    className="h-4 w-4 rounded border-gray-300 text-[#248DD4] focus:ring-[#248DD4]"
                  />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.color }} />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
            {selectedTypeKeys.size === 0 && <p className="mt-2 text-xs font-medium text-red-600">1種類以上選んでください</p>}
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-gray-700">予定の状態</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {([
                ["all", "希望・確定"],
                ["confirmed", "確定のみ"],
                ["desired", "希望のみ"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="export-status"
                    value={value}
                    checked={status === value}
                    onChange={() => {
                      setStatus(value);
                      setCopied(false);
                      setCopyError(false);
                    }}
                    disabled={busy}
                    className="h-4 w-4 border-gray-300 text-[#248DD4] focus:ring-[#248DD4]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </details>

        {/* 読み込み失敗を「0件」と同じ文で出すと、書き出す予定が無いのか
            取得できていないのか区別できない。失敗は失敗として見せる。 */}
        {shiftsError ? (
          <div className="mb-5 rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-3 py-2">
            <p role="alert" className="text-xs font-bold text-[#D9736F]">
              {shiftsError}
            </p>
          </div>
        ) : (
        <div className="mb-5 rounded-md bg-blue-50 px-3 py-2">
          <p className="text-xs text-[#1B6FA8]">
            {isLoading
              ? "予定を読み込んでいます…"
              : targetShifts.length === 0
                ? "条件に一致する予定はありません"
                : method === "spreadsheet"
                  ? `${targetShifts.length}件の予定を、1日から月末までの1行としてコピーします`
                  : `${targetShifts.length}件の予定を .ics ファイルに書き出します`}
          </p>
        </div>
        )}

        {method === "spreadsheet" && (
          <div className="mb-5 text-xs leading-5 text-gray-600">
            「8月シフト」などの対象月シートで、自分の行の「1日」セルを選び、そのまま貼り付けてください。
            リモートは末尾に「(リ)」、同日の複数枠はカンマ区切りになります。
          </div>
        )}
        {copyError && (
          <p className="mb-4 text-xs font-medium text-red-600">
            コピーできませんでした。ブラウザのクリップボード許可を確認してください。
          </p>
        )}

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
            disabled={!canExport}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-[#248DD4] rounded bg-[#248DD4] text-white hover:bg-[#1B6FA8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? "コピーしました" : method === "spreadsheet" ? "Excel用にコピー" : "書き出す"}
          </button>
        </div>
    </Dialog>
  );
}
