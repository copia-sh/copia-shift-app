import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toDateKey } from "../utils/date";
import {
  DOW_LABELS,
  TIME_CHOICES,
  canTapCell,
  cellStatesOf,
  daysOfMonth,
  isSameDate,
  parseSelKey,
  primaryCellState,
  selKey,
  shortRange,
  cellBoxes,
  skinStyle,
  type Skin,
  type BulkOp,
  type SelKey,
  type ShiftMode,
} from "./shiftVisual";
import type { ShiftTheme } from "./shiftTheme";
import { useCenterToday, useStateMap, type ViewCommon } from "./viewShared";
import { SelectedBadge } from "./SelectedBadge";
import { GroupSwitcher } from "./GroupSwitcher";
import { MonthGridPC } from "./monthView/MonthGridPC";
import { MonthGridMobile } from "./monthView/MonthGridMobile";
import { MonthTotals } from "./monthView/MonthTotals";
import { listNameWidth } from "./responsiveLayout";
import { REJECTED_TYPE } from "../types";
import { formatHours, summarizeWorkHours, type WorkHoursSummary } from "./workHours";
import type { Shift, Group } from "../types";

/* ------------------------------------------------------------------ 共通 */

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
  screenSwitcher,
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
  /** PC だけで出す「シフト｜タスク」。グループ名の右隣に置く */
  screenSwitcher?: ReactNode;
}) {
  const square =
    "h-[34px] w-[34px] rounded-md border border-gray-200 bg-white text-[15px] font-bold text-gray-700 shadow-[0_2px_0_0_#E3E3E3] hover:bg-[#F0F0F0] active:translate-y-0.5 active:shadow-none";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1.5 pt-2 md:gap-3 md:px-5 md:pt-2.5">
      <div className="flex min-w-0 items-center gap-2 md:gap-2.5">
        <GroupSwitcher
          groups={groups}
          currentGroupId={currentGroupId}
          onChange={onChangeGroup}
          onCreateNew={onCreateNewGroup}
        />
        {screenSwitcher}
        <span className="whitespace-nowrap text-lg font-bold text-gray-900 md:text-xl">{label}</span>
      </div>
      <div className="flex w-full items-center gap-1.5 md:w-auto md:gap-2">
        <button type="button" onClick={onPrev} className={square}>
          ‹
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-[34px] rounded-md border border-gray-200 bg-white px-2.5 text-[12px] font-bold text-gray-700 shadow-[0_2px_0_0_#E3E3E3] hover:bg-[#F0F0F0] active:translate-y-0.5 active:shadow-none md:px-3.5 md:text-[13px]"
        >
          今月
        </button>
        <button type="button" onClick={onNext} className={square}>
          ›
        </button>
        <div className="ml-auto flex overflow-hidden rounded-md border border-gray-200 shadow-[0_2px_0_0_#E3E3E3] md:ml-0">
          {([
            ["list", "一覧"],
            ["month", "月"],
            ["week", "週"],
          ] as const).map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeView(id)}
              className={`h-[34px] px-2.5 text-[12px] font-bold md:px-3.5 md:text-[13px] ${
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

  const contents = (
    <>
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
    </>
  );

  return (
    <>
      <details className="mx-3 mb-2 rounded-md border border-gray-200 bg-white md:hidden">
        <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-bold text-gray-600">
          凡例・操作方法（{items.length}項目）
        </summary>
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-3 py-2.5">
          {contents}
        </div>
      </details>
      <div className="hidden flex-wrap items-center gap-3.5 px-5 pb-2.5 md:flex">
        {contents}
      </div>
    </>
  );
}

/** メンバー名を押している（マウスなら乗せている）間だけ出す、その月の合計時間 */
interface HoursPeek {
  memberId: string;
  top: number;
  left: number;
}

function MemberHoursPopover({ peek, name, summary }: { peek: HoursPeek; name: string; summary: WorkHoursSummary }) {
  const untimed = (days: number) => (days > 0 ? ` ＋時間未設定 ${days}日` : "");
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-gray-700 shadow-lg"
      style={{ top: peek.top, left: peek.left }}
    >
      <div className="mb-0.5 text-[11px] font-bold text-gray-400">{name} の今月の合計</div>
      <div>
        確定 <span className="font-bold text-gray-900">{formatHours(summary.fixedHours)}</span>
        <span className="text-[11px] text-gray-400">{untimed(summary.fixedUntimedDays)}</span>
      </div>
      <div>
        希望 <span className="font-bold text-gray-900">{formatHours(summary.wantHours)}</span>
        <span className="text-[11px] text-gray-400">{untimed(summary.wantUntimedDays)}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-gray-400">6時間以上の日は休憩1時間を引いています</div>
    </div>
  );
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
  const nameW = listNameWidth(typeof window === "undefined" ? 1280 : window.innerWidth);
  const scrollRef = useRef<HTMLDivElement>(null);
  useCenterToday(scrollRef, anchorDate, nameW, colW);
  const [peek, setPeek] = useState<HoursPeek | null>(null);
  const showPeek = (memberId: string, e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPeek({ memberId, top: rect.top, left: rect.right + 6 });
  };
  const hidePeek = () => setPeek(null);
  const peekMember = peek ? members.find((m) => m.id === peek.memberId) : undefined;

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
      <div style={{ minWidth: nameW + colW * days.length }}>
        <div className="flex border-b border-gray-200 bg-[#FBFCFD]">
          <div
            className="sticky left-0 z-20 flex flex-none items-end border-r border-gray-200 bg-[#FBFCFD] px-2.5 py-1.5 text-[10px] font-bold text-gray-400"
            style={{ width: nameW }}
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
                // disabled だとポインタイベントが届かず合計時間を出せないので、aria-disabled で表す
                aria-disabled={!bulkHeaders}
                title={bulkHeaders ? "この人の1ヶ月をまとめて選択" : undefined}
                onClick={() =>
                  bulkHeaders &&
                  onToggleMany(
                    dayMeta
                      .filter((_, di) => canTapCell(mode, mem.id, currentMemberId, states[di]))
                      .map((d) => selKey(mem.id, d.dateKey)),
                  )
                }
                onPointerEnter={(e) => e.pointerType === "mouse" && showPeek(mem.id, e)}
                onPointerDown={(e) => showPeek(mem.id, e)}
                onPointerUp={(e) => e.pointerType !== "mouse" && hidePeek()}
                onPointerLeave={hidePeek}
                onPointerCancel={hidePeek}
                onContextMenu={(e) => e.preventDefault()}
                className="sticky left-0 z-10 flex flex-none select-none items-center gap-1.5 border-r border-gray-200 px-2 text-left md:gap-2 md:px-2.5 [-webkit-touch-callout:none]"
                style={{
                  width: nameW,
                  boxSizing: "border-box",
                  background: isOwn ? "#F1F8FE" : "#fff",
                  boxShadow: isOwn ? "inset 3px 0 0 0 #248DD4" : undefined,
                }}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: mem.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-gray-900">
                    {mem.displayName}
                  </span>
                  <span
                    className="block truncate text-[10px] text-gray-400"
                    title={`確定 ${fixedCount}・希望 ${wantCount}`}
                  >
                    <span className="md:hidden">登録{fixedCount + wantCount}</span>
                    <span className="hidden md:inline">
                      確定{fixedCount}・希望{wantCount}
                    </span>
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
            style={{ width: nameW }}
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
      {peekMember && (
        <MemberHoursPopover
          peek={peek!}
          name={peekMember.displayName}
          summary={summarizeWorkHours(
            dayMeta.map((d) => cellStatesOf(byKey.get(selKey(peekMember.id, d.dateKey)) ?? [], unavailableKeys)),
            unavailableKeys,
          )}
        />
      )}
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
}: ViewCommon) {
  const byKey = useStateMap(shifts);
  const grid = { anchorDate, members, byKey, currentMemberId, mode, selected, settings, theme, onCellTap, onToggleMany };
  return (
    <>
      <div className="hidden md:block">
        <MonthTotals anchorDate={anchorDate} members={members} byKey={byKey} theme={theme} />
      </div>
      <MonthGridPC {...grid} />
      <MonthGridMobile {...grid} />
    </>
  );
}

/* 週は weekView/ShiftWeekView.tsx へ移した。App からの読み込み先を変えずに済むよう再輸出する。 */
export { ShiftWeekView } from "./weekView/ShiftWeekView";

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
    <div className="pointer-events-none fixed inset-x-0 bottom-[var(--screen-footer-h)] z-50 flex justify-center px-2 pb-2 md:bottom-0 md:px-3 md:pb-3.5">
      <div className="pointer-events-auto flex max-h-[42svh] w-full max-w-5xl flex-col gap-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2.5 shadow-[2px_2px_4px_0_rgba(57,57,57,0.3)] md:max-h-none md:gap-2.5 md:p-3.5">
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
