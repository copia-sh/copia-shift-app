import { useMemo } from "react";
import { toDateKey } from "../utils/date";
import {
  DOW_LABELS,
  TIME_CHOICES,
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
} from "./shiftVisual";
import type { Member, ShiftEntry } from "../types";

/* ------------------------------------------------------------------ 共通 */

const NAME_W = 132;
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8:00-21:00
const HOUR_H = 44;

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

export function ShiftLegend() {
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
      <span className="ml-auto text-[11px] text-gray-400">
        セルをタップで複数選択 → 下のバーでまとめて編集
      </span>
    </div>
  );
}

interface ViewCommon {
  anchorDate: Date;
  members: Member[];
  entries: ShiftEntry[];
  currentMemberId: string;
  selected: Set<SelKey>;
  onToggle: (key: SelKey) => void;
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

const ring = (on: boolean) => (on ? "outline outline-[2.5px] outline-offset-1 outline-[#F07474]" : "");

/* ------------------------------------------------- 一覧（縦=メンバー × 横=日付） */

export function ShiftListMatrix({
  anchorDate,
  members,
  entries,
  currentMemberId,
  selected,
  onToggle,
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
              title="この日の4人をまとめて選択"
              onClick={() => onToggleMany(members.map((m) => selKey(m.id, d.dateKey)))}
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
                title="この人の1ヶ月をまとめて選択"
                onClick={() => onToggleMany(dayMeta.map((d) => selKey(mem.id, d.dateKey)))}
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
                const time = showTimes ? shortRange(st) : null;
                return (
                  <button
                    key={d.dateKey}
                    type="button"
                    onClick={() => onToggle(k)}
                    className="flex flex-none items-center justify-center border-l border-[#EFF1F3]"
                    style={{ width: colW, background: d.bg }}
                  >
                    <span
                      className={`flex flex-col items-center justify-center gap-px rounded leading-none ${sk.box} ${ring(selected.has(k))}`}
                      style={{ width: colW - 4, height: rowH - 8 }}
                    >
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
  selected,
  onToggle,
  onToggleMany,
  showTimes = true,
  density = "compact",
}: ViewCommon) {
  const comfy = density === "comfortable";
  const weeks = useMemo(() => monthGridWeeks(anchorDate), [anchorDate]);
  const byKey = useStateMap(entries);
  const today = new Date();

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
                    title="この日の4人をまとめて選択"
                    onClick={() => onToggleMany(members.map((m) => selKey(m.id, dateKey)))}
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={
                      fixed >= 2
                        ? { background: "#D1E9F9", color: "#0863A0" }
                        : fixed === 1
                          ? { background: "#F0F0F0", color: "#333" }
                          : { background: "#FDF1F1", color: "#D9736F" }
                    }
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
                    const meta = (showTimes && shortRange(st)) || sk.label;
                    const isOwn = mem.id === currentMemberId;
                    return (
                      <button
                        key={mem.id}
                        type="button"
                        onClick={() => onToggle(k)}
                        className={`flex items-center justify-between gap-1 rounded px-1.5 leading-none ${comfy ? "py-1" : "py-0.5"} ${sk.box} ${ring(selected.has(k))} ${
                          isOwn && !selected.has(k) ? "shadow-[inset_0_0_0_2px_rgba(36,141,212,0.2)]" : ""
                        }`}
                      >
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

/* ------------------------------------------------- 週（可否バー + 時間軸） */

export function ShiftWeekView({
  anchorDate,
  members,
  entries,
  currentMemberId,
  selected,
  onToggle,
  onToggleMany,
}: ViewCommon) {
  const days = useMemo(() => weekDaysOf(anchorDate), [anchorDate]);
  const byKey = useStateMap(entries);
  const today = new Date();

  return (
    <div className="border-t border-gray-200">
      {/* 日付ヘッダー + 4人の可否バー（スクロールなしで可否が読める） */}
      <div className="grid border-b border-gray-200 bg-[#FBFCFD]" style={{ gridTemplateColumns: "56px repeat(7, minmax(0,1fr))" }}>
        <div className="flex items-end justify-end p-1.5 text-[9px] font-bold text-gray-400">4人の可否</div>
        {days.map((day) => {
          const dateKey = toDateKey(day);
          const dow = day.getDay();
          const isToday = isSameDate(day, today);
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
                  title="この日の4人をまとめて選択"
                  onClick={() => onToggleMany(members.map((m) => selKey(m.id, dateKey)))}
                  className="text-[17px] font-bold"
                  style={
                    isToday
                      ? {
                          background: "#248DD4",
                          color: "#fff",
                          borderRadius: "50%",
                          width: 26,
                          height: 26,
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
                {members.map((mem) => {
                  const st = cellStateOf(byKey.get(selKey(mem.id, dateKey)));
                  const sk = skinOf(st);
                  const k = selKey(mem.id, dateKey);
                  const isOwn = mem.id === currentMemberId;
                  return (
                    <button
                      key={mem.id}
                      type="button"
                      onClick={() => onToggle(k)}
                      className={`flex flex-col items-center gap-px rounded py-0.5 leading-none ${sk.box} ${ring(selected.has(k))} ${
                        isOwn && !selected.has(k) ? "shadow-[inset_0_0_0_2px_rgba(36,141,212,0.25)]" : ""
                      }`}
                    >
                      <span className={`text-[8px] font-bold ${sk.fg}`}>{mem.name.slice(0, 3)}</span>
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
      <div className="max-h-[560px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0,1fr))" }}>
          <div>
            {HOURS.map((h) => (
              <div
                key={h}
                className="border-t border-[#F4F6F8] pr-1.5 text-right text-[10px] text-gray-400"
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
                  const top = (hourValue(st.startTime) - HOURS[0]) * HOUR_H;
                  const height = Math.max((hourValue(st.endTime) - hourValue(st.startTime)) * HOUR_H - 3, 26);
                  return (
                    <button
                      key={mem.id}
                      type="button"
                      onClick={() => onToggle(k)}
                      className={`absolute flex flex-col gap-0.5 overflow-hidden rounded px-1 py-0.5 text-left ${sk.box} ${ring(selected.has(k))}`}
                      style={{ top, height, left: `calc(${mi} * 25% + 2px)`, width: "calc(25% - 4px)" }}
                    >
                      <span className={`text-[10px] font-bold leading-tight ${sk.fg}`}>{mem.name.slice(0, 3)}</span>
                      <span className={`text-[8px] font-bold leading-tight ${sk.sub}`}>
                        {st.startTime}-{st.endTime}
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
  );
}

/* ------------------------------------------------- まとめて編集バー */

export function BulkEditToolbar({
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
  selected: Set<SelKey>;
  members: Member[];
  entries: ShiftEntry[];
  startTime: string;
  endTime: string;
  busy: boolean;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onApply: (op: BulkOp) => void;
  onClear: () => void;
}) {
  if (selected.size === 0) return null;
  const byKey = useStateMap(entries);
  const keys = [...selected];
  const states = keys.map((k) => {
    const { memberId, dateKey } = parseSelKey(k);
    return cellStateOf(byKey.get(selKey(memberId, dateKey)));
  });
  const dates = new Set(keys.map((k) => parseSelKey(k).dateKey));
  const people = new Set(keys.map((k) => parseSelKey(k).memberId));
  const btn = "h-[34px] rounded-md px-3.5 text-[12px] font-bold active:translate-y-0.5 active:shadow-none disabled:opacity-50";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3.5">
      <div className="pointer-events-auto flex w-full max-w-5xl flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-3.5 shadow-[2px_2px_4px_0_rgba(57,57,57,0.3)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-900">{selected.size}件を選択中</span>
          <span className="text-[11px] text-gray-400">
            {dates.size}日 / {people.size}人 ・ 確定 {states.filter((s) => s.kind === "fixed").length} ・ 希望{" "}
            {states.filter((s) => s.kind === "want").length} ・ 不可 {states.filter((s) => s.kind === "no").length}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-bold text-gray-400"
          >
            選択解除
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply({ kind: "desired", type: "出勤" })}
            className={`${btn} border-[1.5px] border-dashed border-[#248DD4] bg-[#EAF5FD] text-[#0863A0] shadow-[0_2px_0_0_#C6E3F7]`}
          >
            出勤希望にする
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply({ kind: "desired", type: "リモート" })}
            className={`${btn} border-[1.5px] border-dashed border-[#1F8A98] bg-[#E6F4F5] text-[#14646E] shadow-[0_2px_0_0_#C3E4E7]`}
          >
            リモート希望にする
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply({ kind: "unavailable" })}
            className={`${btn} bg-[#F07474] text-white shadow-[0_2px_0_0_#DA5E5E]`}
          >
            不可にする
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
            className="h-[34px] rounded-md border border-gray-200 px-2 text-[13px] font-bold"
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
            className="h-[34px] rounded-md border border-gray-200 px-2 text-[13px] font-bold"
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
            終日にする
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApply({ kind: "confirm" })}
            className={`${btn} ml-auto bg-[#248DD4] text-white shadow-[0_2px_0_0_#0863A0]`}
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
        </div>
      </div>
    </div>
  );
}
