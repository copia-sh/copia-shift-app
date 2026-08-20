import { useMemo, useState } from "react";
import { isSameDay } from "date-fns";
import { toDateKey } from "../utils/date";
import type { Member, ShiftEntry, ShiftType } from "../types";

/**
 * 縦=メンバー × 横=日付 の月マトリクス。
 * 4人分が常に縦に並ぶため、1日の可否をスクロールなしで比較できる。
 * 日付方向のみ横スクロール（メンバー名列は左に固定）。
 */

export type CellState = "none" | "want" | "no" | "fixed";

/** 既存データからの状態導出（スキーマ変更なし） */
export function cellStateOf(entry: ShiftEntry | undefined): CellState {
  if (!entry) return "none";
  if (entry.status === "confirmed") return "fixed";
  if (entry.type === "欠勤") return "no";
  return "want";
}

/** 自分の行をタップしたときの遷移: 未回答 -> 希望 -> 不可 -> 未回答 */
export const OWN_CYCLE: Record<CellState, CellState> = {
  none: "want",
  want: "no",
  no: "none",
  fixed: "fixed",
};

const CELL_VISUAL: Record<
  CellState,
  { box: string; mark: string; markClass: string; subClass: string }
> = {
  fixed: {
    box: "bg-[#248DD4] border border-[#248DD4] shadow-[0_2px_0_0_#0863A0]",
    mark: "✓",
    markClass: "text-[12px] font-bold text-white",
    subClass: "text-[8px] font-bold text-white/90",
  },
  want: {
    box: "bg-[#EAF5FD] border-[1.5px] border-dashed border-[#248DD4]",
    mark: "○",
    markClass: "text-[11px] font-bold text-[#0863A0]",
    subClass: "text-[8px] font-bold text-[#0863A0]/85",
  },
  no: {
    box: "bg-[#FDF1F1] border border-[#F0C7C7]",
    mark: "×",
    markClass: "text-[11px] font-bold text-[#D9736F]",
    subClass: "text-[8px] text-[#D9736F]",
  },
  none: {
    box: "bg-white border border-dashed border-[#E3E3E3]",
    mark: "·",
    markClass: "text-[10px] text-[#C8CDD2]",
    subClass: "text-[8px] text-[#C8CDD2]",
  },
};

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const NAME_W = 132;

function daysOfMonth(anchor: Date): Date[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
}

interface MonthMatrixViewProps {
  anchorDate: Date;
  members: Member[];
  entries: ShiftEntry[];
  currentMemberId: string;
  busy: boolean;
  density?: "compact" | "comfortable";
  showTimes?: boolean;
  highlightOwnRow?: boolean;
  /** 自分のセル: 状態を1段進める（登録/種別変更/削除は App 側で実行） */
  onCycleOwn: (
    dateKey: string,
    from: CellState,
    to: CellState,
    entry: ShiftEntry | undefined,
  ) => void;
  /** 他メンバーのセル / 自分の確定セル: 確定・確定取消のシートを開く */
  onOpenCell: (dateKey: string, member: Member, entry: ShiftEntry | undefined) => void;
}

export function MonthMatrixView({
  anchorDate,
  members,
  entries,
  currentMemberId,
  busy,
  density = "compact",
  showTimes = true,
  highlightOwnRow = true,
  onCycleOwn,
  onOpenCell,
}: MonthMatrixViewProps) {
  const comfortable = density === "comfortable";
  const colW = showTimes ? (comfortable ? 54 : 46) : comfortable ? 40 : 32;
  const rowH = comfortable ? 62 : 50;

  const days = useMemo(() => daysOfMonth(anchorDate), [anchorDate]);
  const entryByKey = useMemo(() => {
    const map = new Map<string, ShiftEntry>();
    for (const e of entries) map.set(`${e.memberId}_${e.date}`, e);
    return map;
  }, [entries]);

  const today = new Date();

  const dayMeta = days.map((day) => {
    const dateKey = toDateKey(day);
    const dow = day.getDay();
    const isToday = isSameDay(day, today);
    const fixed = members.filter(
      (mem) => cellStateOf(entryByKey.get(`${mem.id}_${dateKey}`)) === "fixed",
    ).length;
    return {
      day,
      dateKey,
      dow,
      isToday,
      fixed,
      bg: isToday ? "#FFF6D6" : dow === 0 || dow === 6 ? "#F7F9FA" : "transparent",
      textColor: dow === 0 ? "#D9736F" : dow === 6 ? "#248DD4" : "#8E8E8E",
    };
  });

  const timeLabel = (entry: ShiftEntry | undefined) =>
    showTimes && entry?.startTime && entry?.endTime
      ? `${Number(entry.startTime.slice(0, 2))}-${Number(entry.endTime.slice(0, 2))}`
      : null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <div style={{ minWidth: NAME_W + colW * days.length }}>
        {/* 日付ヘッダー */}
        <div className="flex border-b border-gray-200 bg-[#FBFCFD]">
          <div
            className="sticky left-0 z-20 flex flex-none items-end border-r border-gray-200 bg-[#FBFCFD] px-2.5 py-1.5 text-[10px] font-bold text-gray-400"
            style={{ width: NAME_W }}
          >
            メンバー
          </div>
          {dayMeta.map((d) => (
            <div
              key={d.dateKey}
              className="flex flex-none flex-col items-center gap-0.5 border-l border-[#EFF1F3] pb-1.5 pt-1"
              style={{
                width: colW,
                background: d.bg,
                color: d.textColor,
                boxShadow: d.isToday ? "inset 0 2px 0 0 #F9E428" : undefined,
              }}
            >
              <span className="text-[9px] font-bold leading-none">{DOW[d.dow]}</span>
              <span className="text-[13px] font-bold leading-tight">{d.day.getDate()}</span>
            </div>
          ))}
        </div>

        {/* メンバー行 */}
        {members.map((mem) => {
          const isOwn = mem.id === currentMemberId;
          const own = highlightOwnRow && isOwn;
          let fixedCount = 0;
          let wantCount = 0;
          for (const d of dayMeta) {
            const s = cellStateOf(entryByKey.get(`${mem.id}_${d.dateKey}`));
            if (s === "fixed") fixedCount++;
            else if (s === "want") wantCount++;
          }

          return (
            <div
              key={mem.id}
              className="flex items-stretch border-b border-[#EFF1F3]"
              style={{ height: rowH, background: own ? "#F7FBFE" : "#fff" }}
            >
              <div
                className="sticky left-0 z-10 flex flex-none items-center gap-2 border-r border-gray-200 px-2.5"
                style={{
                  width: NAME_W,
                  background: own ? "#F1F8FE" : "#fff",
                  boxShadow: own ? "inset 3px 0 0 0 #248DD4" : undefined,
                }}
              >
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ backgroundColor: mem.color }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-gray-900">
                    {mem.name}
                    {isOwn ? "（自分）" : ""}
                  </div>
                  <div className="whitespace-nowrap text-[10px] text-gray-400">
                    確定 {fixedCount} ・ 希望 {wantCount}
                  </div>
                </div>
              </div>

              {dayMeta.map((d) => {
                const entry = entryByKey.get(`${mem.id}_${d.dateKey}`);
                const state = cellStateOf(entry);
                const v = CELL_VISUAL[state];
                const time = timeLabel(entry);
                return (
                  <button
                    key={d.dateKey}
                    type="button"
                    disabled={busy}
                    title={`${mem.name} / ${d.dateKey}`}
                    onClick={() =>
                      isOwn && state !== "fixed"
                        ? onCycleOwn(d.dateKey, state, OWN_CYCLE[state], entry)
                        : onOpenCell(d.dateKey, mem, entry)
                    }
                    className="flex flex-none items-center justify-center border-l border-[#EFF1F3] disabled:opacity-60"
                    style={{ width: colW, background: d.bg }}
                  >
                    <span
                      className={`flex flex-col items-center justify-center gap-px rounded leading-none ${v.box}`}
                      style={{ width: colW - 4, height: rowH - 8 }}
                    >
                      <span className={v.markClass}>{v.mark}</span>
                      {time && <span className={v.subClass}>{time}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* 日付ごとの確定人数 */}
        <div className="flex border-t border-gray-200 bg-[#FBFCFD]">
          <div
            className="sticky left-0 z-10 flex flex-none items-center border-r border-gray-200 bg-[#FBFCFD] px-2.5 py-1 text-[10px] font-bold text-gray-400"
            style={{ width: NAME_W }}
          >
            確定人数
          </div>
          {dayMeta.map((d) => (
            <div
              key={d.dateKey}
              className="flex-none border-l border-[#EFF1F3] py-1 text-center text-[11px] font-bold"
              style={{
                width: colW,
                background: d.bg,
                color: d.fixed >= 2 ? "#0863A0" : d.fixed === 0 ? "#C8CDD2" : "#333",
              }}
            >
              {d.fixed}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3.5 px-1 py-2.5">
      {[
        { label: "確定", cls: "bg-[#248DD4] shadow-[0_2px_0_0_#0863A0]" },
        { label: "希望", cls: "bg-[#EAF5FD] border-[1.5px] border-dashed border-[#248DD4]" },
        { label: "不可", cls: "bg-[#FDF1F1] border border-[#F0C7C7]" },
        { label: "未回答", cls: "bg-white border border-dashed border-[#E3E3E3]" },
      ].map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3.5 w-3.5 rounded-[3px] ${it.cls}`} />
          <span className="text-[11px] font-bold text-gray-600">{it.label}</span>
        </div>
      ))}
      <span className="ml-auto text-[11px] text-gray-400">
        自分の行をタップで 希望 → 不可 → 未回答
      </span>
    </div>
  );
}

interface CellActionSheetProps {
  dateKey: string;
  member: Member;
  entry: ShiftEntry | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRevert: () => void;
  onRegisterDesired: (type: ShiftType) => void;
}

/** セルタップ時のボトムシート（確定 / 確定取消 / 希望登録） */
export function CellActionSheet({
  dateKey,
  member,
  entry,
  busy,
  onClose,
  onConfirm,
  onRevert,
  onRegisterDesired,
}: CellActionSheetProps) {
  const [state] = useState(() => cellStateOf(entry));
  const label = { fixed: "確定", want: "希望", no: "不可", none: "未回答" }[state];
  const badge =
    state === "fixed"
      ? { background: "#248DD4", color: "#fff" }
      : state === "want"
        ? { background: "#EAF5FD", color: "#0863A0" }
        : state === "no"
          ? { background: "#FDF1F1", color: "#D9736F" }
          : { background: "#F0F0F0", color: "#8E8E8E" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D1828]/35"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-xl bg-white p-4 pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-400">{dateKey}</div>
            <div className="text-lg font-bold text-gray-900">{member.name}</div>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={badge}>
            {label}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {state === "want" && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="h-[38px] rounded-md bg-[#248DD4] px-4 text-[13px] font-bold text-white shadow-[0_4px_0_0_#0863A0] active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              確定にする
            </button>
          )}
          {state === "fixed" && (
            <button
              type="button"
              disabled={busy}
              onClick={onRevert}
              className="h-[38px] rounded-md border border-gray-200 bg-white px-4 text-[13px] font-bold text-gray-700 disabled:opacity-50"
            >
              確定を取り消す
            </button>
          )}
          {(state === "none" || state === "no") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRegisterDesired("出勤")}
              className="h-[38px] rounded-md bg-[#F07474] px-4 text-[13px] font-bold text-white shadow-[0_4px_0_0_#DA5E5E] active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              希望として登録
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-[38px] px-3.5 text-[13px] font-bold text-gray-400"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
