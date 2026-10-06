import { HOUR_H } from "../viewShared";
import { SelectedBadge } from "../SelectedBadge";
import { hourValue, shortRange, skinStyle } from "../shiftVisual";
import type { ShiftTheme } from "../shiftTheme";
import type { TimeAxisBlock } from "./timeAxis";

export interface TimeAxisBlockViewProps {
  block: TimeAxisBlock;
  /** その日に並べる人数。1人ぶんの横幅を決める */
  people: number;
  /** members 配列の中での位置 */
  memberIndex: number;
  displayStartHour: number;
  theme: ShiftTheme | null;
  selected: boolean;
  tappable: boolean;
  onTap: () => void;
  /** 氏名の出し方。PCは2文字、モバイルは全文 */
  nameLength?: number;
}

/** 時間軸の上に置く1枠。位置は実時間の比率で決める（30分の枠も正しい高さになる）。 */
export function TimeAxisBlockView({
  block,
  people,
  memberIndex,
  displayStartHour,
  theme,
  selected,
  tappable,
  onTap,
  nameLength,
}: TimeAxisBlockViewProps) {
  const { member, state, lane, laneCount } = block;
  const skin = theme?.skinFor(state, false) ?? null;
  const skinForSelected = theme?.skinFor(state, selected) ?? null;
  const top = (hourValue(state.startTime!) - displayStartHour) * HOUR_H;
  const height = Math.max(
    (hourValue(state.endTime!) - hourValue(state.startTime!)) * HOUR_H - 3,
    24,
  );
  // 人ごとの列をさらにレーンで割る。重なっていない枠は laneCount が 1 なので幅は変わらない。
  const columnPct = 100 / people;
  const lanePct = columnPct / Math.max(1, laneCount);
  const name = nameLength ? member.displayName.slice(0, nameLength) : member.displayName;

  return (
    <button
      type="button"
      disabled={!tappable}
      onClick={onTap}
      // 人数が多いと枠が細くなり、時刻が途中で切れる。全体はここで読める。
      title={`${member.displayName} ${state.startTime}〜${state.endTime}`}
      className={`absolute flex flex-col gap-0.5 overflow-hidden rounded border px-1 py-0.5 text-left ${
        tappable ? "" : "cursor-default opacity-60"
      }`}
      style={{
        top,
        height,
        left: `calc(${memberIndex * columnPct + lane * lanePct}% + 1px)`,
        width: `calc(${lanePct}% - 2px)`,
        ...(skinForSelected ? skinStyle(skinForSelected) : {}),
      }}
    >
      {selected && skin && <SelectedBadge fg={skin.fg} />}
      <span
        className="block truncate text-[9px] font-bold leading-tight"
        style={{ color: skin?.fg ?? "#333" }}
      >
        {name}
      </span>
      <span className="block text-[8px] font-bold leading-tight" style={{ color: skin?.fg ?? "#333" }}>
        {shortRange(state)}
      </span>
    </button>
  );
}
