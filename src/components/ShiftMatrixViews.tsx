import { useMemo } from "react";
import { toDateKey } from "../utils/date";
import {
  DOW_LABELS,
  TIME_CHOICES,
  boxOf,
  canTapCell,
  cellStateOf,
  daysOfMonth,
  hourValue,
  isSameDate,
  monthGridWeeks,
  parseSelKey,
  selKey,
  shortRange,
  skinOf,
  weekDaysOf,
  type BulkOp,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "./shiftVisual";
import type { Member, ShiftEntry } from "../types";

/* ------------------------------------------------------------------ 共通 */

const NAME_W = 132;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 9); // 9:00-20:00
const HOUR_H = 32;
/** 週ビュー: 1日 = 4人 × 33px。390px 幅では横スクロールになる。 */
const WEEK_PERSON_W = 33;
const WEEK_DAY_W = WEEK_PERSON_W * 4;
const WEEK_GUTTER_W = 44;

/** 選択中を色以外でも示す小さな ✓ バッジ（赤は使わず前景色を流用） */
function SelectedBadge({ fg }: { fg: string }) {
  return (
    <span
      className={`pointer-events-none absolute right-[1px] top-[1px] text-[8px] font-bold leading-none ${fg}`}
      aria-hidden
    >
      ✓
    </span>
  );
}

/** 複数選択 / 確定選択 のモード切替。どちらもOFFなら single。 */
export function ShiftModeToggle({
  mode,
  onChangeMode,
}: {
  mode: ShiftMode;
  onChangeMode: (m: ShiftMode) => void;
}) {
  const items = [
    ["multi", "複数選択"],
    ["review", "確定選択"],
  ] as const;
  return (
    <div className="flex items-center gap-1.5">
      {items.map(([id, text]) => {
        const on = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChangeMode(on ? "single" : id)}
            aria-pressed={on}
            className={`h-[34px] rounded-md px-3 text-[12px] font-bold active:translate-y-0.5 active:shadow-none ${
              on
                ? "border border-[#248DD4] bg-[#248DD4] text-white shadow-[0_2px_0_0_#0863A0]"
                : "border border-gray-200 bg-white text-gray-700 shadow-[0_2px_0_0_#E3E3E3]"
            }`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/** ‹ 今月 › + 一覧/月/週 のトグル。押し込みシャドウ付き（デザインシステムのボタン挙動）。 */
export function CalendarNav({
  label,
  view,
  onPrev,
  onNext,
  onToday,
  onChangeView,
}: {
  label: string;
  view: "list" | "month" | "week";
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (v: "list" | "month" | "week") => void;
}) {
  const square =
    "h-[34px] w-[34px] rounded-md border border-gray-200 bg-white text-[15px] font-bold text-gray-700 shadow-[0_2px_0_0_#E3E3E3] hover:bg-[#F0F0F0] active:translate-y-0.5 active:shadow-none";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] font-bold tracking-wide text-[#248DD4]">Copia シフト</span>
        <span className="text-xl font-bold text-gray-900">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} className={square}>
          ‹
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-[34px] rounded-md border border-[#248DD4] bg-white px-3.5 text-[13px] font-bold text-[#248DD4] shadow-[0_2px_0_0_#D1E9F9] hover:bg-[#D1E9F9] active:translate-y-0.5 active:shadow-none"
        >
          {view === "week" ? "今週" : "今月"}
        </button>
        <button type="button" onClick={onNext} className={square}>
          ›
        </button>
        <div className="flex overflow-hidden rounded-md border border-gray-200 shadow-[0_2px_0_0_#E3E3E3]">
          {([
            ["list", "一覧"],
            ["month", "月"],
            ["week", "週"],
          ] as const).map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeView(id)}
              className={`h-[34px] px-3.5 text-[13px] font-bold ${
                view === id ? "bg-[#248DD4] text-white" : "bg-white text-gray-700"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const MODE_HINT: Record<ShiftMode, string> = {
  single: "自分のセルをタップ → 希望・不可を1段階ずつ切替",
  multi: "自分のセルを複数選択 → 下のバーでまとめて適用",
  review: "誰のセルでも選択 → 確定 / 取消 / 却下",
};

export function ShiftLegend({ mode = "single" }: { mode?: ShiftMode }) {
  const items = [
    ["出勤（確定）", "bg-[#248DD4] shadow-[0_2px_0_0_#0863A0]"],
    ["リモート（確定）", "bg-[#1F8A98] shadow-[0_2px_0_0_#14646E]"],
    ["希望", "bg-[#EAF5FD] border-[1.5px] border-dashed border-[#248DD4]"],
    ["不可", "bg-[#FDF1F1] border border-[#F0C7C7]"],
    ["未回答", "bg-white border border-dashed border-[#E3E3E3]"],
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-3.5 px-4 pb-2.5">
      {items.map(([label, cls]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3.5 w-3.5 rounded-[3px] ${cls}`} />
          <span className="text-[11px] font-bold text-gray-600">{label}</span>
        </div>
      ))}
      <span className="ml-auto text-[11px] text-gray-400">{MODE_HINT[mode]}</span>
    </div>
  );
}

interface ViewCommon {
  anchorDate: Date;
  members: Member[];
  entries: ShiftEntry[];
  currentMemberId: string;
  mode: ShiftMode;
  selected: Set<SelKey>;
  /** モードごとの分岐は App.tsx 側で行う */
  onCellTap: (key: SelKey, state: CellState) => void;
  onToggleMany: (keys: SelKey[]) => void;
  showTimes?: boolean;
  density?: "compact" | "comfortable";
}

function useStateMap(entries: ShiftEntry[]) {
  return useMemo(() => {
    const map = new Map<string, ShiftEntry>();
    for (const e of entries) map.set(`${e.memberId}__${e.date}`, e);
    return map;
  }, [entries]);
}

/* ------------------------------------------------- 一覧（縦=メンバー × 横=日付） */

export function ShiftListMatrix({
  anchorDate,
  members,
  entries,
  currentMemberId,
  mode,
  selected,
  onCellTap,
  onToggleMany,
  showTimes = true,
  density = "compact",
}: ViewCommon) {
  const comfy = density === "comfortable";
  const colW = showTimes ? (comfy ? 56 : 48) : comfy ? 42 : 34;
  const rowH = comfy ? 62 : 50;
  const days = useMemo(() => daysOfMonth(anchorDate), [anchorDate]);
  const byKey = useStateMap(entries);
  const today = new Date();
  const bulkHeaders = mode !== "single";

  const dayMeta = days.map((day) => {
    const dateKey = toDateKey(day);
    const dow = day.getDay();
    const isToday = isSameDate(day, today);
    const fixed = members.filter(
      (m) => cellStateOf(byKey.get(selKey(m.id, dateKey))).kind === "fixed",
    ).length;
    return {
      day,
      dateKey,
      dow,
      isToday,
      fixed,
      bg: isToday ? "#FFF6D6" : dow === 0 || dow === 6 ? "#F7F9FA" : "transparent",
      color: dow === 0 ? "#D9736F" : dow === 6 ? "#248DD4" : "#8E8E8E",
    };
  });

  /** モードで選択可能な行だけをまとめて選択する */
  const bulkKeys = (dateKey: string) =>
    members
      .filter((m) => canTapCell(mode, m.id, currentMemberId, cellStateOf(byKey.get(selKey(m.id, dateKey)))))
      .map((m) => selKey(m.id, dateKey));

  return (
    <div className="overflow-x-auto border-t border-gray-200">
      <div style={{ minWidth: NAME_W + colW * days.length }}>
        <div className="flex border-b border-gray-200 bg-[#FBFCFD]">
          <div
            className="sticky left-0 z-20 flex flex-none items-end border-r border-gray-200 bg-[#FBFCFD] px-2.5 py-1.5 text-[10px] font-bold text-gray-400"
            style={{ width: NAME_W }}
          >
            メンバー
          </div>
          {dayMeta.map((d) => (
            <button
              key={d.dateKey}
              type="button"
              disabled={!bulkHeaders}
              title={bulkHeaders ? "この日をまとめて選択" : undefined}
              onClick={() => onToggleMany(bulkKeys(d.dateKey))}
              className="flex flex-none flex-col items-center gap-0.5 border-l border-[#EFF1F3] pb-1.5 pt-1"
              style={{
                width: colW,
                background: d.bg,
                color: d.color,
                boxShadow: d.isToday ? "inset 0 2px 0 0 #F9E428" : undefined,
              }}
            >
              <span className="text-[9px] font-bold leading-none">{DOW_LABELS[d.dow]}</span>
              <span className="text-[13px] font-bold leading-tight">{d.day.getDate()}</span>
            </button>
          ))}
        </div>

        {members.map((mem) => {
          const isOwn = mem.id === currentMemberId;
          const states = dayMeta.map((d) => cellStateOf(byKey.get(selKey(mem.id, d.dateKey))));
          const fixedCount = states.filter((s) => s.kind === "fixed").length;
          const wantCount = states.filter((s) => s.kind === "want").length;
          return (
            <div
              key={mem.id}
              className="flex items-stretch border-b border-[#EFF1F3]"
              style={{ height: rowH, background: isOwn ? "#F7FBFE" : "#fff" }}
            >
              <button
                type="button"
                disabled={!bulkHeaders}
                title={bulkHeaders ? "この人の1ヶ月をまとめて選択" : undefined}
                onClick={() =>
                  onToggleMany(
                    dayMeta
                      .filter((_, di) => canTapCell(mode, mem.id, currentMemberId, states[di]))
                      .map((d) => selKey(mem.id, d.dateKey)),
                  )
                }
                className="sticky left-0 z-10 flex flex-none items-center gap-2 border-r border-gray-200 px-2.5 text-left"
                style={{
                  width: NAME_W,
                  background: isOwn ? "#F1F8FE" : "#fff",
                  boxShadow: isOwn ? "inset 3px 0 0 0 #248DD4" : undefined,
                }}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: mem.color }} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-gray-900">
                    {mem.name}
                    {isOwn ? "（自分）" : ""}
                  </span>
                  <span className="block whitespace-nowrap text-[10px] text-gray-400">
                    確定 {fixedCount} ・ 希望 {wantCount}
                  </span>
                </span>
              </button>

              {dayMeta.map((d, di) => {
                const st = states[di];
                const sk = skinOf(st);
                const k = selKey(mem.id, d.dateKey);
                const isSel = selected.has(k);
                const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                const time = showTimes ? shortRange(st) : null;
                return (
                  <button
                    key={d.dateKey}
                    type="button"
                    disabled={!tappable}
                    onClick={() => onCellTap(k, st)}
                    className={`flex flex-none items-center justify-center border-l border-[#EFF1F3] ${
                      tappable ? "" : "cursor-default opacity-60"
                    }`}
                    style={{ width: colW, background: d.bg }}
                  >
                    <span
                      className={`relative flex flex-col items-center justify-center gap-px rounded leading-none ${boxOf(sk, isSel)}`}
                      style={{ width: colW - 4, height: rowH - 8 }}
                    >
                      {isSel && <SelectedBadge fg={sk.fg} />}
                      <span className={`text-[11px] font-bold ${sk.fg}`}>{sk.mark}</span>
                      {time && <span className={`text-[8px] font-bold ${sk.sub}`}>{time}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}

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

/* ------------------------------------------------- 月（Google Calendar 型 7列） */

export function ShiftMonthGrid({
  anchorDate,
  members,
  entries,
  currentMemberId,
  mode,
  selected,
  onCellTap,
  onToggleMany,
  showTimes = true,
  density = "compact",
}: ViewCommon) {
  const comfy = density === "comfortable";
  const weeks = useMemo(() => monthGridWeeks(anchorDate), [anchorDate]);
  const byKey = useStateMap(entries);
  const today = new Date();
  const bulkHeaders = mode !== "single";

  return (
    <div className="border-t border-gray-200">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-[#FBFCFD]">
        {DOW_LABELS.map((l, i) => (
          <div
            key={l}
            className="border-l border-[#EFF1F3] py-1.5 text-center text-[11px] font-bold"
            style={{ color: i === 0 ? "#D9736F" : i === 6 ? "#248DD4" : "#8E8E8E" }}
          >
            {l}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-[#EFF1F3]">
          {week.map((day) => {
            const dateKey = toDateKey(day);
            const dow = day.getDay();
            const inMonth = day.getMonth() === anchorDate.getMonth();
            const isToday = isSameDate(day, today);
            const states: CellState[] = members.map((m) => cellStateOf(byKey.get(selKey(m.id, dateKey))));
            const fixed = states.filter((s) => s.kind === "fixed").length;
            return (
              <div
                key={dateKey}
                className="border-l border-[#EFF1F3] p-1.5"
                style={{
                  minHeight: comfy ? 140 : 122,
                  background: isToday
                    ? "#FFFBEA"
                    : inMonth
                      ? dow === 0 || dow === 6
                        ? "#FAFBFC"
                        : "#fff"
                      : "#FAFAFB",
                  opacity: inMonth ? 1 : 0.5,
                  boxShadow: isToday ? "inset 0 3px 0 0 #F9E428" : undefined,
                }}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={!bulkHeaders}
                    title={bulkHeaders ? "この日をまとめて選択" : undefined}
                    onClick={() =>
                      onToggleMany(
                        members
                          .filter((m, mi) => canTapCell(mode, m.id, currentMemberId, states[mi]))
                          .map((m) => selKey(m.id, dateKey)),
                      )
                    }
                    className="rounded px-1 py-0.5 text-[9px] font-bold text-gray-400"
                  >
                    確定 {fixed}
                  </button>
                  <span
                    className="text-[13px] font-bold"
                    style={
                      isToday
                        ? {
                            background: "#248DD4",
                            color: "#fff",
                            borderRadius: "50%",
                            width: 22,
                            height: 22,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }
                        : { color: dow === 0 ? "#D9736F" : dow === 6 ? "#248DD4" : "#333" }
                    }
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {members.map((mem, mi) => {
                    const st = states[mi];
                    const sk = skinOf(st);
                    const k = selKey(mem.id, dateKey);
                    const isSel = selected.has(k);
                    const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                    const meta = (showTimes && shortRange(st)) || sk.label;
                    const isOwn = mem.id === currentMemberId;
                    return (
                      <button
                        key={mem.id}
                        type="button"
                        disabled={!tappable}
                        onClick={() => onCellTap(k, st)}
                        className={`relative flex items-center justify-between gap-1 rounded px-1.5 leading-none ${
                          comfy ? "py-1" : "py-0.5"
                        } ${boxOf(sk, isSel)} ${
                          isOwn && !isSel ? "shadow-[inset_0_0_0_2px_rgba(36,141,212,0.2)]" : ""
                        } ${tappable ? "" : "cursor-default opacity-60"}`}
                      >
                        {isSel && <SelectedBadge fg={sk.fg} />}
                        <span className={`truncate text-[10px] font-bold ${sk.fg}`}>{mem.name}</span>
                        <span className={`flex-none text-[9px] font-bold ${sk.sub}`}>{meta}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------- 週（可否バー + 時間軸 / 横スクロール固定幅） */

export function ShiftWeekView({
  anchorDate,
  members,
  entries,
  currentMemberId,
  mode,
  selected,
  onCellTap,
  onToggleMany,
}: ViewCommon) {
  const days = useMemo(() => weekDaysOf(anchorDate), [anchorDate]);
  const byKey = useStateMap(entries);
  const today = new Date();
  const bulkHeaders = mode !== "single";
  const gridCols = `${WEEK_GUTTER_W}px repeat(7, ${WEEK_DAY_W}px)`;
  const totalW = WEEK_GUTTER_W + WEEK_DAY_W * 7;

  return (
    <div className="overflow-x-auto border-t border-gray-200">
      <div style={{ width: totalW }}>
        {/* 日付ヘッダー + 4人の可否バー（縦スクロールなしで可否が読める） */}
        <div className="grid border-b border-gray-200 bg-[#FBFCFD]" style={{ gridTemplateColumns: gridCols }}>
          <div className="flex items-end justify-end p-1 text-[9px] font-bold leading-tight text-gray-400">可否</div>
          {days.map((day) => {
            const dateKey = toDateKey(day);
            const dow = day.getDay();
            const isToday = isSameDate(day, today);
            const states = members.map((m) => cellStateOf(byKey.get(selKey(m.id, dateKey))));
            return (
              <div
                key={dateKey}
                className="border-l border-[#EFF1F3] px-1 pb-1.5 pt-1.5 text-center"
                style={{ background: isToday ? "#FFFBEA" : dow === 0 || dow === 6 ? "#FAFBFC" : "#fff" }}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: dow === 0 ? "#D9736F" : dow === 6 ? "#248DD4" : "#8E8E8E" }}
                  >
                    {DOW_LABELS[dow]}
                  </span>
                  <button
                    type="button"
                    disabled={!bulkHeaders}
                    title={bulkHeaders ? "この日をまとめて選択" : undefined}
                    onClick={() =>
                      onToggleMany(
                        members
                          .filter((m, mi) => canTapCell(mode, m.id, currentMemberId, states[mi]))
                          .map((m) => selKey(m.id, dateKey)),
                      )
                    }
                    className="text-[16px] font-bold"
                    style={
                      isToday
                        ? {
                            background: "#248DD4",
                            color: "#fff",
                            borderRadius: "50%",
                            width: 24,
                            height: 24,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }
                        : { color: dow === 0 ? "#D9736F" : dow === 6 ? "#248DD4" : "#393939" }
                    }
                  >
                    {day.getDate()}
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-0.5">
                  {members.map((mem, mi) => {
                    const st = states[mi];
                    const sk = skinOf(st);
                    const k = selKey(mem.id, dateKey);
                    const isSel = selected.has(k);
                    const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                    const isOwn = mem.id === currentMemberId;
                    return (
                      <button
                        key={mem.id}
                        type="button"
                        disabled={!tappable}
                        onClick={() => onCellTap(k, st)}
                        className={`relative flex flex-col items-center gap-px rounded py-1 leading-none ${boxOf(sk, isSel)} ${
                          isOwn && !isSel ? "shadow-[inset_0_0_0_2px_rgba(36,141,212,0.25)]" : ""
                        } ${tappable ? "" : "cursor-default opacity-60"}`}
                      >
                        {isSel && <SelectedBadge fg={sk.fg} />}
                        <span className={`text-[9px] font-bold ${sk.fg}`}>{mem.name.slice(0, 2)}</span>
                        <span className={`text-[11px] font-bold ${sk.fg}`}>{sk.mark}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 時間軸 */}
        <div className="max-h-[420px] overflow-y-auto">
          <div className="grid" style={{ gridTemplateColumns: gridCols }}>
            <div>
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-t border-[#F4F6F8] pr-1 text-right text-[9px] text-gray-400"
                  style={{ height: HOUR_H }}
                >
                  {h}:00
                </div>
              ))}
            </div>
            {days.map((day) => {
              const dateKey = toDateKey(day);
              const isToday = isSameDate(day, today);
              return (
                <div
                  key={dateKey}
                  className="relative border-l border-[#EFF1F3]"
                  style={{ height: HOUR_H * HOURS.length, background: isToday ? "#FFFDF4" : "#fff" }}
                >
                  {HOURS.map((h) => (
                    <div key={h} className="border-t border-[#F1F3F5]" style={{ height: HOUR_H }} />
                  ))}
                  {members.map((mem, mi) => {
                    const st = cellStateOf(byKey.get(selKey(mem.id, dateKey)));
                    if (!st.startTime || !st.endTime || (st.kind !== "fixed" && st.kind !== "want")) return null;
                    const sk = skinOf(st);
                    const k = selKey(mem.id, dateKey);
                    const isSel = selected.has(k);
                    const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                    const top = (hourValue(st.startTime) - HOURS[0]) * HOUR_H;
                    const height = Math.max((hourValue(st.endTime) - hourValue(st.startTime)) * HOUR_H - 3, 24);
                    return (
                      <button
                        key={mem.id}
                        type="button"
                        disabled={!tappable}
                        onClick={() => onCellTap(k, st)}
                        className={`absolute flex flex-col gap-0.5 overflow-hidden rounded px-1 py-0.5 text-left ${boxOf(sk, isSel)} ${
                          tappable ? "" : "cursor-default opacity-60"
                        }`}
                        style={{ top, height, left: mi * WEEK_PERSON_W + 1, width: WEEK_PERSON_W - 2 }}
                      >
                        {isSel && <SelectedBadge fg={sk.fg} />}
                        <span className={`text-[9px] font-bold leading-tight ${sk.fg}`}>{mem.name.slice(0, 2)}</span>
                        <span className={`text-[8px] font-bold leading-tight ${sk.sub}`}>
                          {Number(st.startTime.slice(0, 2))}-{Number(st.endTime.slice(0, 2))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- 下部パネル（モード別） */

export function BulkEditToolbar({
  mode,
  selected,
  entries,
  startTime,
  endTime,
  busy,
  onChangeStart,
  onChangeEnd,
  onApply,
  onClear,
}: {
  mode: ShiftMode;
  selected: Set<SelKey>;
  entries: ShiftEntry[];
  startTime: string;
  endTime: string;
  busy: boolean;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onApply: (op: BulkOp) => void;
  onClear: () => void;
}) {
  const byKey = useStateMap(entries);
  if (selected.size === 0) return null;
  const keys = [...selected];
  const states = keys.map((k) => {
    const { memberId, dateKey } = parseSelKey(k);
    return cellStateOf(byKey.get(selKey(memberId, dateKey)));
  });
  const dates = new Set(keys.map((k) => parseSelKey(k).dateKey));
  const people = new Set(keys.map((k) => parseSelKey(k).memberId));
  const btn =
    "h-[38px] rounded-md px-3.5 text-[12px] font-bold active:translate-y-0.5 active:shadow-none disabled:opacity-50";
  const title =
    mode === "review" ? "確定の操作" : mode === "multi" ? `${selected.size}件をまとめて変更` : "このセルを変更";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3.5">
      <div className="pointer-events-auto flex w-full max-w-5xl flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-3.5 shadow-[2px_2px_4px_0_rgba(57,57,57,0.3)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-900">{title}</span>
          <span className="text-[11px] text-gray-400">
            {dates.size}日 / {people.size}人 ・ 確定 {states.filter((s) => s.kind === "fixed").length} ・ 希望{" "}
            {states.filter((s) => s.kind === "want").length} ・ 不可 {states.filter((s) => s.kind === "no").length}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-bold text-gray-400"
          >
            選択解除
          </button>
        </div>

        {mode === "review" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply({ kind: "confirm" })}
              className={`${btn} bg-[#248DD4] text-white shadow-[0_2px_0_0_#0863A0]`}
            >
              確定にする
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply({ kind: "revert" })}
              className={`${btn} border border-gray-200 bg-white text-gray-700 shadow-[0_2px_0_0_#E3E3E3]`}
            >
              確定を取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply({ kind: "reject" })}
              className={`${btn} border border-[#F0C7C7] bg-[#FDF1F1] text-[#D9736F] shadow-[0_2px_0_0_#F0C7C7]`}
            >
              却下（未回答に戻す）
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "desired", type: "出勤" })}
                className={`${btn} border-[1.5px] border-dashed border-[#248DD4] bg-[#EAF5FD] text-[#0863A0] shadow-[0_2px_0_0_#C6E3F7]`}
              >
                出勤希望
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "desired", type: "リモート" })}
                className={`${btn} border-[1.5px] border-dashed border-[#1F8A98] bg-[#E6F4F5] text-[#14646E] shadow-[0_2px_0_0_#C3E4E7]`}
              >
                リモート希望
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "unavailable" })}
                className={`${btn} bg-[#F07474] text-white shadow-[0_2px_0_0_#DA5E5E]`}
              >
                不可
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "clear" })}
                className={`${btn} border border-gray-200 bg-white text-gray-400 shadow-[0_2px_0_0_#E3E3E3]`}
              >
                未回答に戻す
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-gray-200 pt-2">
              <span className="text-[11px] font-bold text-gray-400">時間帯</span>
              <select
                value={startTime}
                onChange={(e) => onChangeStart(e.target.value)}
                className="h-[38px] rounded-md border border-gray-200 px-2 text-[13px] font-bold"
              >
                {TIME_CHOICES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="text-[12px] text-gray-400">〜</span>
              <select
                value={endTime}
                onChange={(e) => onChangeEnd(e.target.value)}
                className="h-[38px] rounded-md border border-gray-200 px-2 text-[13px] font-bold"
              >
                {TIME_CHOICES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "time", startTime, endTime })}
                className={`${btn} border border-[#248DD4] bg-white text-[#248DD4]`}
              >
                時間を適用
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "time", startTime: null, endTime: null })}
                className={`${btn} border border-gray-200 bg-white text-gray-400`}
              >
                終日
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
