import { useMemo, useRef } from "react";
import { toDateKey } from "../../utils/date";
import {
  DOW_LABELS,
  canTapCell,
  cellStatesOf,
  daysOfMonth,
  isSameDate,
  primaryCellState,
  selKey,
  skinStyle,
} from "../shiftVisual";
import { HOUR_H, useCenterToday, useStateMap, type ViewCommon } from "../viewShared";
import { SelectedBadge } from "../SelectedBadge";
import { weekDayWidth } from "../responsiveLayout";
import { timeAxisBlocks } from "./timeAxis";
import { TimeAxisBlockView } from "./TimeAxisBlockView";
import { COLOR } from "../../theme/palette";

const WEEK_GUTTER_W = 44;

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
  const weekDayW = weekDayWidth(members.length);
  const gridCols = `${WEEK_GUTTER_W}px repeat(${days.length}, ${weekDayW}px)`;
  const totalW = WEEK_GUTTER_W + weekDayW * days.length;
  const hours = Array.from({ length: settings.displayEndHour - settings.displayStartHour }, (_, i) => i + settings.displayStartHour);
  const scrollRef = useRef<HTMLDivElement>(null);
  useCenterToday(scrollRef, anchorDate, WEEK_GUTTER_W, weekDayW);

  return (
    <>
    <div ref={scrollRef} className="hidden max-h-[70vh] overflow-auto border-t border-line md:block">
      <div style={{ width: totalW }}>
        <div className="sticky top-0 z-20 grid border-b border-line bg-surface-2" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky left-0 z-30 flex items-end justify-end border-r border-line-2 bg-surface-2 p-1 text-[9px] font-bold leading-tight text-ink-5">可否</div>
          {days.map((day) => {
            const dateKey = toDateKey(day);
            const dow = day.getDay();
            const isToday = isSameDate(day, today);
            const states = members.map((m) => primaryCellState(cellStatesOf(byKey.get(selKey(m.id, dateKey)) ?? [], unavailableKeys)));
            return (
              <div
                key={dateKey}
                className="border-l border-line-2 px-1 pb-1.5 pt-1.5 text-center"
                style={{ background: isToday ? COLOR.todayWash2 : dow === 0 || dow === 6 ? COLOR.surface3 : COLOR.surface }}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: dow === 0 ? COLOR.coral : dow === 6 ? COLOR.brand : COLOR.ink4 }}
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
                            background: COLOR.brand,
                            color: COLOR.surface,
                            borderRadius: "50%",
                            width: 24,
                            height: 24,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }
                        : { color: dow === 0 ? COLOR.coral : dow === 6 ? COLOR.brand : COLOR.ink2 }
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
                        <span className="text-[9px] font-bold" style={{ color: sk?.fg ?? COLOR.ink2 }}>{mem.displayName.slice(0, 2)}</span>
                        <span className="text-[11px] font-bold" style={{ color: sk?.fg ?? COLOR.ink2 }}>{sk?.mark ?? "·"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky left-0 z-10 border-r border-line-2 bg-white">
            {hours.map((h) => (
              <div
                key={h}
                className="border-t border-line-4 pr-1 text-right text-[9px] text-ink-5"
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
                className="relative overflow-hidden border-l border-line-2"
                style={{ height: HOUR_H * hours.length, background: isToday ? COLOR.todayWash3 : COLOR.surface }}
              >
                {hours.map((h) => (
                  <div key={h} className="border-t border-line-3" style={{ height: HOUR_H }} />
                ))}
                {timeAxisBlocks(members, (memberId) =>
                  cellStatesOf(byKey.get(selKey(memberId, dateKey)) ?? [], unavailableKeys),
                ).map((block, index) => {
                  const k = selKey(block.member.id, dateKey);
                  return (
                    <TimeAxisBlockView
                      key={`${block.member.id}-${index}`}
                      block={block}
                      people={Math.max(1, members.length)}
                      memberIndex={members.findIndex((m) => m.id === block.member.id)}
                      displayStartHour={settings.displayStartHour}
                      theme={theme}
                      selected={selected.has(k)}
                      tappable={canTapCell(mode, block.member.id, currentMemberId, block.state)}
                      onTap={() => onCellTap(k, block.state)}
                      nameLength={2}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    <MobileWeekView
      anchorDate={anchorDate}
      members={members}
      shifts={shifts}
      currentMemberId={currentMemberId}
      mode={mode}
      selected={selected}
      settings={settings}
      theme={theme}
      onCellTap={onCellTap}
      onToggleMany={onToggleMany}
    />
    </>
  );
}

function MobileWeekView({
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
  const unavailableKeys = theme?.unavailableKeys ?? new Set();
  const hours = Array.from(
    { length: settings.displayEndHour - settings.displayStartHour },
    (_, index) => index + settings.displayStartHour,
  );
  const today = new Date();
  const bulkHeaders = mode !== "single";
  const scrollRef = useRef<HTMLDivElement>(null);
  // カード幅に gap-2 (8px) を足したスクロール刻み。ここがカード幅だけだと、
  // 月末では gap の累積分だけ前日へずれる。
  useCenterToday(scrollRef, anchorDate, 0, typeof window === "undefined" ? 351 : window.innerWidth - 24);

  return (
    <div ref={scrollRef} className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 md:hidden">
      {days.map((day) => {
        const dateKey = toDateKey(day);
        const dow = day.getDay();
        const isToday = isSameDate(day, today);
        const states = members.map((member) =>
          primaryCellState(cellStatesOf(byKey.get(selKey(member.id, dateKey)) ?? [], unavailableKeys)),
        );
        return (
          <section key={dateKey} className="w-[calc(100vw-32px)] flex-none snap-center overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line-3 bg-surface-2 px-3 py-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[16px] font-bold text-ink">{day.getDate()}日</span>
                <span className="text-[11px] font-bold" style={{ color: dow === 0 ? COLOR.coral : dow === 6 ? COLOR.brand : COLOR.ink4 }}>
                  {DOW_LABELS[dow]}
                </span>
                {isToday && <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold text-white">今日</span>}
              </div>
              <button
                type="button"
                disabled={!bulkHeaders}
                onClick={() =>
                  onToggleMany(
                    members
                      .filter((member, index) => canTapCell(mode, member.id, currentMemberId, states[index]))
                      .map((member) => selKey(member.id, dateKey)),
                  )
                }
                className="text-[10px] font-bold text-ink-5"
              >
                日を選択
              </button>
            </div>
            <div className="grid gap-1 border-b border-line-3 p-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, members.length)}, minmax(0, 1fr))` }}>
              {members.map((member, index) => {
                const state = states[index];
                const key = selKey(member.id, dateKey);
                const isSelected = selected.has(key);
                const skin = theme ? theme.skinFor(state, isSelected) : null;
                const tappable = canTapCell(mode, member.id, currentMemberId, state);
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={!tappable}
                    onClick={() => onCellTap(key, state)}
                    className={`relative min-w-0 rounded border px-1 py-1.5 ${tappable ? "" : "cursor-default opacity-60"}`}
                    style={skin ? skinStyle(skin) : {}}
                  >
                    {isSelected && skin && <SelectedBadge fg={skin.fg} />}
                    <span className="block truncate text-[9px] font-bold" style={{ color: skin?.fg }}>{member.displayName}</span>
                    <span className="mt-0.5 block text-[11px] font-bold" style={{ color: skin?.fg }}>{skin?.mark ?? "·"}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `38px minmax(0, 1fr)` }}>
              <div className="border-r border-line-3 bg-surface-2">
                {hours.map((hour) => (
                  <div key={hour} className="border-t border-line-3 pr-1 text-right text-[8px] text-ink-5" style={{ height: HOUR_H }}>
                    {hour}:00
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: HOUR_H * hours.length, background: isToday ? COLOR.todayWash3 : COLOR.surface }}>
                {hours.map((hour) => <div key={hour} className="border-t border-line-3" style={{ height: HOUR_H }} />)}
                {timeAxisBlocks(members, (memberId) =>
                  cellStatesOf(byKey.get(selKey(memberId, dateKey)) ?? [], unavailableKeys),
                ).map((block, index) => {
                  const key = selKey(block.member.id, dateKey);
                  return (
                    <TimeAxisBlockView
                      key={`${block.member.id}-${index}`}
                      block={block}
                      people={Math.max(1, members.length)}
                      memberIndex={members.findIndex((m) => m.id === block.member.id)}
                      displayStartHour={settings.displayStartHour}
                      theme={theme}
                      selected={selected.has(key)}
                      tappable={canTapCell(mode, block.member.id, currentMemberId, block.state)}
                      onTap={() => onCellTap(key, block.state)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

