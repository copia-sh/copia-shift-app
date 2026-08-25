import { useEffect, useMemo, useRef } from "react";
import { toDateKey } from "../utils/date";
import {
  DOW_LABELS,
  TIME_CHOICES,
  canTapCell,
  cellStatesOf,
  daysOfMonth,
  dowLabelsFrom,
  hourValue,
  isSameDate,
  monthGridWeeks,
  parseSelKey,
  primaryCellState,
  selKey,
  shortRange,
  cellBoxes,
  skinStyle,
  type Skin,
  type BulkOp,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "./shiftVisual";
import type { ShiftTheme } from "./shiftTheme";
import { GroupSwitcher } from "./GroupSwitcher";
import { REJECTED_TYPE } from "../types";
import type { GroupSettings, Member, Shift, Group } from "../types";

/* ------------------------------------------------------------------ 共通 */

const NAME_W = 132;
const HOUR_H = 32;
const WEEK_GUTTER_W = 44;

/** 選択中を色以外でも示す小さな ✓ バッジ（赤は使わず前景色を流用） */
function SelectedBadge({ fg }: { fg: string }) {
  return (
    <span
      className="pointer-events-none absolute right-[1px] top-[1px] text-[8px] font-bold leading-none"
      style={{ color: fg }}
      aria-hidden
    >
      ✓
    </span>
  );
}

/** 当月を開いたとき、当日の列が見えるよう中央付近へ移動する。 */
function useCenterToday(
  ref: React.RefObject<HTMLDivElement | null>,
  anchorDate: Date,
  leadingWidth: number,
  dayWidth: number,
) {
  const monthKey = `${anchorDate.getFullYear()}-${anchorDate.getMonth()}`;
  useEffect(() => {
    const today = new Date();
    if (
      today.getFullYear() !== anchorDate.getFullYear() ||
      today.getMonth() !== anchorDate.getMonth()
    ) {
      return;
    }
    const center = () => {
      const node = ref.current;
      if (!node) return;
      node.scrollLeft = Math.max(
        0,
        leadingWidth + (today.getDate() - 1) * dayWidth + dayWidth / 2 - node.clientWidth / 2,
      );
    };
    const timers = [60, 240, 600].map((delay) => window.setTimeout(center, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [anchorDate, dayWidth, leadingWidth, monthKey, ref]);
}

/** 複数選択 / 確定選択 のモード切替。どちらもOFFなら single。 */
export function ShiftModeToggle({
  mode,
  canConfirm,
  onChangeMode,
}: {
  mode: ShiftMode;
  canConfirm: boolean;
  onChangeMode: (m: ShiftMode) => void;
}) {
  const items = [
    ["multi", "複数選択"],
    ["review", "確定選択"],
  ] as const;
  return (
    <div className="flex items-center gap-1.5">
      {items.map(([id, text]) => {
        if (id === "review" && !canConfirm) return null;
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
  groups,
  currentGroupId,
  onChangeGroup,
  onCreateNewGroup,
}: {
  label: string;
  view: "list" | "month" | "week";
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (v: "list" | "month" | "week") => void;
  groups: Group[];
  currentGroupId: string;
  onChangeGroup: (id: string) => void;
  onCreateNewGroup: () => void;
}) {
  const square =
    "h-[34px] w-[34px] rounded-md border border-gray-200 bg-white text-[15px] font-bold text-gray-700 shadow-[0_2px_0_0_#E3E3E3] hover:bg-[#F0F0F0] active:translate-y-0.5 active:shadow-none";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1.5 pt-2.5">
      <div className="flex items-center gap-2.5">
        <GroupSwitcher
          groups={groups}
          currentGroupId={currentGroupId}
          onChange={onChangeGroup}
          onCreateNew={onCreateNewGroup}
        />
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
          今月
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

export function ShiftLegend({
  mode = "single",
  theme,
}: {
  mode?: ShiftMode;
  theme?: ShiftTheme | null;
}) {
  const items: { label: string; skin: Skin }[] = [];

  if (theme) {
    for (const type of theme.types) {
      const fixed = theme.skinFor({ kind: "fixed", type: type.key, startTime: null, endTime: null }, false);
      items.push({ label: fixed.label, skin: fixed });

      if (type.attendance === "available") {
        const want = theme.skinFor({ kind: "want", type: type.key, startTime: null, endTime: null }, false);
        items.push({ label: want.label, skin: want });
      }
    }

    const rejected = theme.skinFor(
      { kind: "no", type: REJECTED_TYPE, startTime: null, endTime: null },
      false,
    );
    items.push({ label: rejected.label, skin: rejected });
  }

  const none = theme
    ? theme.skinFor({ kind: "none", type: "", startTime: null, endTime: null }, false)
    : {
        bg: "#ffffff",
        border: "#E3E3E3",
        borderStyle: "dashed" as const,
        borderWidth: "1px",
        fg: "#C8CDD2",
        shadow: "",
        mark: "·",
        label: "未回答",
      };
  items.push({ label: none.label, skin: none });

  return (
    <div className="flex flex-wrap items-center gap-3.5 px-5 pb-2.5">
      {items.map(({ label, skin }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-3.5 rounded-[3px] border"
            style={skinStyle(skin)}
          />
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
  shifts: Shift[];
  currentMemberId: string;
  mode: ShiftMode;
  selected: Set<SelKey>;
  settings: GroupSettings;
  theme: ShiftTheme | null;
  /** モードごとの分岐は App.tsx 側で行う */
  onCellTap: (key: SelKey, state: CellState) => void;
  onToggleMany: (keys: SelKey[]) => void;
  showTimes?: boolean;
  density?: "compact" | "comfortable";
}

function useStateMap(shifts: Shift[]) {
  return useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.memberId}__${s.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [shifts]);
}

/* ------------------------------------------------- 一覧（縦=メンバー × 横=日付） */

export function ShiftListMatrix({
  anchorDate,
  members,
  shifts,
  currentMemberId,
  mode,
  selected,
  settings,
  theme,
  onCellTap,
  onToggleMany,
  showTimes = true,
  density = "compact",
}: ViewCommon) {
  const comfy = density === "comfortable";
  const colW = showTimes ? (comfy ? 56 : 48) : comfy ? 42 : 34;
  const rowH = comfy ? 62 : 50;
  const days = useMemo(() => daysOfMonth(anchorDate), [anchorDate]);
  const byKey = useStateMap(shifts);
  const today = new Date();
  const bulkHeaders = mode !== "single";
  const unavailableKeys = theme?.unavailableKeys ?? new Set();
  const scrollRef = useRef<HTMLDivElement>(null);
  useCenterToday(scrollRef, anchorDate, NAME_W, colW);

  const dayMeta = days.map((day) => {
    const dateKey = toDateKey(day);
    const dow = day.getDay();
    const isToday = isSameDate(day, today);
    const fixed = members.filter(
      (m) => primaryCellState(cellStatesOf(byKey.get(selKey(m.id, dateKey)) ?? [], unavailableKeys)).kind === "fixed",
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
      .filter((m) => canTapCell(mode, m.id, currentMemberId, primaryCellState(cellStatesOf(byKey.get(selKey(m.id, dateKey)) ?? [], unavailableKeys))))
      .map((m) => selKey(m.id, dateKey));

  return (
    <div ref={scrollRef} className="overflow-x-auto border-t border-gray-200">
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
                boxSizing: "border-box",
                padding: "4px 0",
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
          const states = dayMeta.map((d) => primaryCellState(cellStatesOf(byKey.get(selKey(mem.id, d.dateKey)) ?? [], unavailableKeys)));
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
                  boxSizing: "border-box",
                  background: isOwn ? "#F1F8FE" : "#fff",
                  boxShadow: isOwn ? "inset 3px 0 0 0 #248DD4" : undefined,
                }}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: mem.color }} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-gray-900">
                    {mem.displayName}
                  </span>
                  <span className="block whitespace-nowrap text-[10px] text-gray-400">
                    確定 {fixedCount} ・ 希望 {wantCount}
                  </span>
                </span>
              </button>

              {dayMeta.map((d) => {
                const cellStates = byKey.get(selKey(mem.id, d.dateKey)) ?? [];
                const allStates = cellStatesOf(cellStates, unavailableKeys);
                const st = primaryCellState(allStates);
                const k = selKey(mem.id, d.dateKey);
                const isSel = selected.has(k);
                const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                const boxes = cellBoxes(allStates, settings.displayStartHour, settings.displayEndHour);
                const sk = theme ? theme.skinFor(st, isSel) : null;
                return (
                  <button
                    key={d.dateKey}
                    type="button"
                    disabled={!tappable}
                    onClick={() => onCellTap(k, st)}
                    className={`relative flex flex-none items-center justify-center border-l border-[#EFF1F3] ${
                      tappable ? "" : "cursor-default opacity-60"
                    }`}
                    style={{ width: colW, boxSizing: "border-box", padding: "4px 0", background: d.bg }}
                  >
                    {boxes.length === 0 ? (
                      <span
                        className="relative flex flex-col items-center justify-center gap-px rounded leading-none border"
                        style={{
                          width: colW - 4,
                          height: rowH - 8,
                          ...(sk ? skinStyle(sk) : {}),
                        }}
                      >
                        {isSel && sk && <SelectedBadge fg={sk.fg} />}
                        {sk && <span className="text-[11px] font-bold" style={{ color: sk.fg }}>{sk.mark}</span>}
                      </span>
                    ) : (
                      <span className="relative flex gap-px overflow-hidden rounded" style={{ width: colW - 4, height: rowH - 8 }}>
                        {boxes.map((box, bi) => {
                          const boxSk = theme ? theme.skinFor(box.state, isSel) : null;
                          const showMark = box.widthPct >= 25;
                          const range = showTimes ? shortRange(box.state) : null;
                          return (
                            <span
                              key={bi}
                              className="flex min-w-0 flex-col items-center justify-center gap-px overflow-hidden rounded border leading-none"
                              style={{
                                flexBasis: 0,
                                flexGrow: box.widthPct,
                                ...(boxSk ? skinStyle(boxSk) : {}),
                              }}
                            >
                              {showMark && boxSk && <span className="text-[11px] font-bold" style={{ color: boxSk.fg }}>{boxSk.mark}</span>}
                              {range && boxSk && <span className="text-[7px] font-bold" style={{ color: boxSk.fg }}>{range}</span>}
                            </span>
                          );
                        })}
                        {isSel && sk && <SelectedBadge fg={sk.fg} />}
                      </span>
                    )}
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
                boxSizing: "border-box",
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
  shifts,
  currentMemberId,
  mode,
  selected,
  settings,
  theme,
  onCellTap,
  onToggleMany,
  showTimes = true,
  density = "compact",
}: ViewCommon) {
  const comfy = density === "comfortable";
  const weeks = useMemo(() => monthGridWeeks(anchorDate, settings.weekStartsOn), [anchorDate, settings.weekStartsOn]);
  const byKey = useStateMap(shifts);
  const today = new Date();
  const bulkHeaders = mode !== "single";
  const unavailableKeys = theme?.unavailableKeys ?? new Set();

  const dowLabels = dowLabelsFrom(settings.weekStartsOn);
  return (
    <div className="border-t border-gray-200">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-[#FBFCFD]">
        {dowLabels.map((l, i) => {
          const actualDow = (i + settings.weekStartsOn) % 7;
          return (
            <div
              key={l + i}
              className="border-l border-[#EFF1F3] py-1.5 text-center text-[11px] font-bold"
              style={{ color: actualDow === 0 ? "#D9736F" : actualDow === 6 ? "#248DD4" : "#8E8E8E" }}
            >
              {l}
            </div>
          );
        })}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-[#EFF1F3]">
          {week.map((day) => {
            const dateKey = toDateKey(day);
            const dow = day.getDay();
            const inMonth = day.getMonth() === anchorDate.getMonth();
            const isToday = isSameDate(day, today);
            const states: CellState[] = members.map((m) => primaryCellState(cellStatesOf(byKey.get(selKey(m.id, dateKey)) ?? [], unavailableKeys)));
            const fixed = states.filter((s) => s.kind === "fixed").length;
            return (
              <div
                key={dateKey}
                className="border-l border-[#EFF1F3] p-1.5"
                style={{
                  minHeight: comfy ? 176 : 158,
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
                <div className="grid grid-cols-2 gap-1">
                  {members.map((mem) => {
                    const cellStates = byKey.get(selKey(mem.id, dateKey)) ?? [];
                    const allStates = cellStatesOf(cellStates, unavailableKeys);
                    const st = primaryCellState(allStates);
                    const sk = theme ? theme.skinFor(st, false) : null;
                    const k = selKey(mem.id, dateKey);
                    const isSel = selected.has(k);
                    const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                    const boxes = cellBoxes(allStates, settings.displayStartHour, settings.displayEndHour);
                    const isSimple = allStates.length <= 1;
                    const range = showTimes ? shortRange(st) : null;
                    const isOwn = mem.id === currentMemberId;
                    const skForSel = theme ? theme.skinFor(st, isSel) : null;
                    return (
                      <button
                        key={mem.id}
                        type="button"
                        disabled={!tappable}
                        onClick={() => onCellTap(k, st)}
                        className={`relative h-[52px] overflow-hidden rounded-md border leading-none ${
                          isOwn && !isSel ? "shadow-[inset_0_0_0_2px_rgba(36,141,212,0.2)]" : ""
                        } ${tappable ? "" : "cursor-default opacity-60"}`}
                        style={{
                          ...(boxes.length === 0 || isSimple
                            ? skForSel
                              ? skinStyle(skForSel)
                              : {}
                            : { backgroundColor: "#fff", borderColor: "#E5E7EB" }),
                        }}
                      >
                        {isSel && sk && <SelectedBadge fg={sk.fg} />}
                        {boxes.length === 0 || isSimple ? (
                          <span className="flex h-full flex-col items-center justify-center gap-px px-1">
                            <span className="max-w-full truncate text-[9px] font-bold" style={{ color: sk?.fg ?? "#4B5563" }}>
                              {mem.displayName.slice(0, 2)}
                            </span>
                            <span className="text-[12px] font-bold" style={{ color: sk?.fg ?? "#C8CDD2" }}>
                              {sk?.mark ?? "·"}
                            </span>
                            {range && <span className="text-[8px] font-bold" style={{ color: sk?.fg ?? "#4B5563" }}>{range}</span>}
                          </span>
                        ) : (
                          <>
                            <span className="absolute inset-x-1 top-1 truncate text-center text-[9px] font-bold text-[#4B5563]">
                              {mem.displayName.slice(0, 2)}
                            </span>
                            <span className="absolute inset-x-0.5 bottom-0.5 top-[15px] flex gap-0.5">
                              {boxes.map((box, bi) => {
                                const bsk = theme ? theme.skinFor(box.state, isSel) : null;
                                const boxRange = showTimes ? shortRange(box.state) : null;
                                return (
                                  <span
                                    key={bi}
                                    className="flex min-w-0 flex-col items-center justify-center gap-px overflow-hidden rounded-sm border"
                                    style={{
                                      flexBasis: 0,
                                      flexGrow: box.widthPct,
                                      ...(bsk ? skinStyle(bsk) : {}),
                                    }}
                                  >
                                    {bsk && <span className="text-[10px] font-bold" style={{ color: bsk.fg }}>{bsk.mark}</span>}
                                    {boxRange && bsk && <span className="text-[8px] font-bold" style={{ color: bsk.fg }}>{boxRange}</span>}
                                  </span>
                                );
                              })}
                            </span>
                          </>
                        )}
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
  shifts,
  currentMemberId,
  mode,
  selected,
  settings,
  theme,
  onCellTap,
  onToggleMany,
}: ViewCommon) {
  const days = useMemo(() => daysOfMonth(anchorDate), [anchorDate]);
  const byKey = useStateMap(shifts);
  const today = new Date();
  const bulkHeaders = mode !== "single";
  const unavailableKeys = theme?.unavailableKeys ?? new Set();
  const weekDayW = Math.max(96, 34 * Math.max(1, members.length));
  const gridCols = `${WEEK_GUTTER_W}px repeat(${days.length}, ${weekDayW}px)`;
  const totalW = WEEK_GUTTER_W + weekDayW * days.length;
  const hours = Array.from({ length: settings.displayEndHour - settings.displayStartHour }, (_, i) => i + settings.displayStartHour);
  const scrollRef = useRef<HTMLDivElement>(null);
  useCenterToday(scrollRef, anchorDate, WEEK_GUTTER_W, weekDayW);

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto border-t border-gray-200">
      <div style={{ width: totalW }}>
        <div className="sticky top-0 z-20 grid border-b border-gray-200 bg-[#FBFCFD]" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky left-0 z-30 flex items-end justify-end border-r border-[#EFF1F3] bg-[#FBFCFD] p-1 text-[9px] font-bold leading-tight text-gray-400">可否</div>
          {days.map((day) => {
            const dateKey = toDateKey(day);
            const dow = day.getDay();
            const isToday = isSameDate(day, today);
            const states = members.map((m) => primaryCellState(cellStatesOf(byKey.get(selKey(m.id, dateKey)) ?? [], unavailableKeys)));
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
                <div className="mt-1.5 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, members.length)}, minmax(0, 1fr))` }}>
                  {members.map((mem, mi) => {
                    const st = states[mi];
                    const sk = theme ? theme.skinFor(st, false) : null;
                    const k = selKey(mem.id, dateKey);
                    const isSel = selected.has(k);
                    const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                    const isOwn = mem.id === currentMemberId;
                    const skForSel = theme ? theme.skinFor(st, isSel) : null;
                    return (
                      <button
                        key={mem.id}
                        type="button"
                        disabled={!tappable}
                        onClick={() => onCellTap(k, st)}
                        className={`relative flex flex-col items-center gap-px rounded py-1 leading-none border ${
                          isOwn && !isSel ? "shadow-[inset_0_0_0_2px_rgba(36,141,212,0.25)]" : ""
                        } ${tappable ? "" : "cursor-default opacity-60"}`}
                        style={skForSel ? skinStyle(skForSel) : {}}
                      >
                        {isSel && sk && <SelectedBadge fg={sk.fg} />}
                        <span className="text-[9px] font-bold" style={{ color: sk?.fg ?? "#333" }}>{mem.displayName.slice(0, 2)}</span>
                        <span className="text-[11px] font-bold" style={{ color: sk?.fg ?? "#333" }}>{sk?.mark ?? "·"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky left-0 z-10 border-r border-[#EFF1F3] bg-white">
            {hours.map((h) => (
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
                className="relative overflow-hidden border-l border-[#EFF1F3]"
                style={{ height: HOUR_H * hours.length, background: isToday ? "#FFFDF4" : "#fff" }}
              >
                {hours.map((h) => (
                  <div key={h} className="border-t border-[#F1F3F5]" style={{ height: HOUR_H }} />
                ))}
                {members.map((mem, mi) => {
                  const allStates = cellStatesOf(byKey.get(selKey(mem.id, dateKey)) ?? [], unavailableKeys);
                  const timed = allStates.filter(
                    (state) => state.startTime && state.endTime && (state.kind === "fixed" || state.kind === "want"),
                  );
                  const st = timed.find((state) => state.kind === "fixed") ?? timed[0];
                  if (!st?.startTime || !st.endTime) return null;
                  const sk = theme ? theme.skinFor(st, false) : null;
                  const k = selKey(mem.id, dateKey);
                  const isSel = selected.has(k);
                  const tappable = canTapCell(mode, mem.id, currentMemberId, st);
                  const top = (hourValue(st.startTime) - settings.displayStartHour) * HOUR_H;
                  const height = Math.max((hourValue(st.endTime) - hourValue(st.startTime)) * HOUR_H - 3, 24);
                  const skForSel = theme ? theme.skinFor(st, isSel) : null;
                  const people = Math.max(1, members.length);
                  return (
                    <button
                      key={mem.id}
                      type="button"
                      disabled={!tappable}
                      onClick={() => onCellTap(k, st)}
                      className={`absolute flex flex-col gap-0.5 overflow-hidden rounded px-1 py-0.5 text-left border ${
                        tappable ? "" : "cursor-default opacity-60"
                      }`}
                      style={{
                        top,
                        height,
                        left: `calc(${(mi * 100) / people}% + 1px)`,
                        width: `calc(${100 / people}% - 2px)`,
                        ...(skForSel ? skinStyle(skForSel) : {}),
                      }}
                    >
                      {isSel && sk && <SelectedBadge fg={sk.fg} />}
                      <span className="text-[9px] font-bold leading-tight" style={{ color: sk?.fg ?? "#333" }}>{mem.displayName.slice(0, 2)}</span>
                      <span className="text-[8px] font-bold leading-tight" style={{ color: sk?.fg ?? "#333" }}>
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
  );
}

/* ------------------------------------------------- 下部パネル（モード別） */

export function BulkEditToolbar({
  mode,
  selected,
  shifts,
  startTime,
  endTime,
  busy,
  onChangeStart,
  onChangeEnd,
  onApply,
  onClear,
  currentMemberId,
  onOpenSegmentEditor,
  theme,
}: {
  mode: ShiftMode;
  selected: Set<SelKey>;
  shifts: Shift[];
  startTime: string;
  endTime: string;
  busy: boolean;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onApply: (op: BulkOp) => void;
  onClear: () => void;
  currentMemberId?: string;
  onOpenSegmentEditor?: (k: SelKey) => void;
  theme?: ShiftTheme | null;
}) {
  const byKey = useStateMap(shifts);
  const unavailableKeys = theme?.unavailableKeys ?? new Set();
  // 「時間で分ける」の対象になるセル。single モードで自分のセルを1つだけ
  // 選んでいるときのみ非 null。
  const editableSelfCellKey = (() => {
    if (mode !== "single" || selected.size !== 1 || !currentMemberId) return null;
    const [k] = [...selected];
    return parseSelKey(k).memberId === currentMemberId ? k : null;
  })();
  if (selected.size === 0) return null;
  const keys = [...selected];
  const states = keys.map((k) => {
    const { memberId, dateKey } = parseSelKey(k);
    return primaryCellState(cellStatesOf(byKey.get(selKey(memberId, dateKey)) ?? [], unavailableKeys));
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
              className={`${btn} bg-[#248DD4] text-white`}
            >
              確定にする
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply({ kind: "revert" })}
              className={`${btn} border border-gray-200 bg-white text-gray-700`}
            >
              確定を取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply({ kind: "reject" })}
              className={`${btn} border border-[#F0C7C7] bg-[#FDF1F1] text-[#D9736F]`}
            >
              却下
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {theme &&
                theme.types.map((type) => {
                  const sk = theme.skinFor(
                    type.attendance === "available"
                      ? { kind: "want", type: type.key, startTime: null, endTime: null }
                      : { kind: "no", type: type.key, startTime: null, endTime: null },
                    false,
                  );
                  const label =
                    type.attendance === "available" ? `${type.label}希望` : type.label;
                  return (
                    <button
                      key={type.key}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onApply(
                          type.attendance === "available"
                            ? { kind: "desired", type: type.key }
                            : { kind: "unavailable", type: type.key }
                        )
                      }
                      className={`${btn} border`}
                      style={skinStyle(sk)}
                    >
                      {label}
                    </button>
                  );
                })}
              <button
                type="button"
                disabled={busy}
                onClick={() => onApply({ kind: "clear" })}
                className={`${btn} border border-gray-200 bg-white text-gray-400`}
              >
                未回答に戻す
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-gray-200 pt-2">
              {/* 自分のセルを1つだけ選んでいるときにだけ出す。押しても何も起きない
                  ボタンを見せないよう、所有者の判定を描画時に済ませておく。 */}
              {editableSelfCellKey && onOpenSegmentEditor && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenSegmentEditor(editableSelfCellKey)}
                    className={`${btn} border border-[#248DD4] bg-white text-[#248DD4]`}
                  >
                    時間で分ける
                  </button>
                  <div className="border-l border-gray-300" style={{ height: "20px" }} />
                </>
              )}
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
