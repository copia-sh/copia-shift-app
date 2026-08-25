import type { Shift, ShiftType } from "../types";

/** 表示状態: 未回答 / 希望 / 不可 / 確定（希望・確定は 出勤 か リモート の2種） */
export type CellKind = "none" | "want" | "no" | "fixed";
export interface CellState {
  kind: CellKind;
  type: ShiftType; // 出勤 | リモート | 欠勤 | 未定
  startTime: string | null;
  endTime: string | null;
  shift?: Shift;
}

/** セルタップの意味を切り替えるモード */
export type ShiftMode = "single" | "multi" | "review";

function cellStateOf(shift: Shift): CellState {
  const base = { type: shift.type, startTime: shift.startTime, endTime: shift.endTime, shift };
  if (shift.status === "confirmed") return { kind: "fixed", ...base };
  if (shift.type === "欠勤" || shift.type === "却下") return { kind: "no", ...base };
  return { kind: "want", ...base };
}

/** そのセル（1メンバー×1日）の全セグメントを、開始時刻の早い順に返す。終日枠は先頭。 */
export function cellStatesOf(shifts: Shift[]): CellState[] {
  return shifts
    .map(cellStateOf)
    .sort((a, b) => {
      const aIsAllDay = !a.startTime && !a.endTime;
      const bIsAllDay = !b.startTime && !b.endTime;
      if (aIsAllDay && !bIsAllDay) return -1;
      if (!aIsAllDay && bIsAllDay) return 1;
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      return 0;
    });
}

/** 既存の「1セル=1状態」の描画を維持するための代表値。セグメントが無ければ kind:"none"。
 *  確定(fixed)が1つでもあれば確定を優先し、次に希望(want)、最後に不可(no)を返す。 */
export function primaryCellState(states: CellState[]): CellState {
  if (states.length === 0) return { kind: "none", type: "未定", startTime: null, endTime: null };
  if (states.some((s) => s.kind === "fixed")) {
    const fixed = states.find((s) => s.kind === "fixed")!;
    return fixed;
  }
  if (states.some((s) => s.kind === "want")) {
    const want = states.find((s) => s.kind === "want")!;
    return want;
  }
  if (states.some((s) => s.kind === "no")) {
    const no = states.find((s) => s.kind === "no")!;
    return no;
  }
  return { kind: "none", type: "未定", startTime: null, endTime: null };
}

/** "no" セルの表示文字列。却下は不可と同じ見た目で文字列だけ変える。 */
export const noLabel = (st: CellState): string => (st.type === "却下" ? "却下" : "不可");

export interface Skin {
  box: string;
  /** 選択中: 同じ色味を一段濃くするだけ（枠線の色は足さない） */
  boxSelected: string;
  fg: string;
  sub: string;
  mark: string;
  label: string;
}

/** 出勤=ブランドブルー / リモート=ティール / 不可=コーラル。確定はベタ塗り+押し込みシャドウ、希望は淡色+破線。 */
export const SKINS = {
  fixedWork: {
    box: "bg-[#248DD4] border border-[#248DD4] shadow-[0_2px_0_0_#0863A0]",
    boxSelected: "bg-[#1B6FA8] border border-[#1B6FA8] shadow-[0_2px_0_0_#0A4E7C]",
    fg: "text-white",
    sub: "text-white/90",
    mark: "✓",
    label: "出勤",
  },
  fixedRemote: {
    box: "bg-[#1F8A98] border border-[#1F8A98] shadow-[0_2px_0_0_#14646E]",
    boxSelected: "bg-[#166C77] border border-[#166C77] shadow-[0_2px_0_0_#0E4C55]",
    fg: "text-white",
    sub: "text-white/90",
    mark: "R",
    label: "リモート",
  },
  wantWork: {
    box: "bg-[#EAF5FD] border-[1.5px] border-dashed border-[#248DD4]",
    boxSelected: "bg-[#BFE3FA] border-[1.5px] border-dashed border-[#0863A0]",
    fg: "text-[#0863A0]",
    sub: "text-[#0863A0]/85",
    mark: "○",
    label: "出勤希望",
  },
  wantRemote: {
    box: "bg-[#E6F4F5] border-[1.5px] border-dashed border-[#1F8A98]",
    boxSelected: "bg-[#BCE0E4] border-[1.5px] border-dashed border-[#14646E]",
    fg: "text-[#14646E]",
    sub: "text-[#14646E]/85",
    mark: "R",
    label: "リモート希望",
  },
  no: {
    box: "bg-[#FDF1F1] border border-[#F0C7C7]",
    boxSelected: "bg-[#F6D8D6] border border-[#E0A9A6]",
    fg: "text-[#D9736F]",
    sub: "text-[#D9736F]",
    mark: "×",
    label: "不可",
  },
  none: {
    box: "bg-white border border-dashed border-[#E3E3E3]",
    boxSelected: "bg-[#EAF5FD] border border-dashed border-[#9FCDEB]",
    fg: "text-[#C8CDD2]",
    sub: "text-[#C8CDD2]",
    mark: "·",
    label: "未回答",
  },
} satisfies Record<string, Skin>;

export function skinOf(st: CellState): Skin {
  if (st.kind === "fixed") return st.type === "リモート" ? SKINS.fixedRemote : SKINS.fixedWork;
  if (st.kind === "want") return st.type === "リモート" ? SKINS.wantRemote : SKINS.wantWork;
  if (st.kind === "no") return SKINS.no;
  return SKINS.none;
}

/** 選択中なら濃い方の背景を返す */
export const boxOf = (sk: Skin, isSelected: boolean) => (isSelected ? sk.boxSelected : sk.box);

/** そのモードでこのセルがタップできるか */
export function canTapCell(mode: ShiftMode, memberId: string, currentMemberId: string, st: CellState): boolean {
  if (mode === "review") return st.kind !== "none"; // 未回答は確定対象外
  if (memberId !== currentMemberId) return false; // single / multi は自分の行だけ
  return st.kind !== "fixed"; // 確定済みは review でのみ扱う
}

/**
 * single モードの1段階サイクル:
 * 未回答 → 出勤希望 → リモート希望 → 不可 → 未回答
 * 確定済みセルは single では書き換えない（確定選択モードで扱う）。
 */
export function nextInCycle(st: CellState): BulkOp | null {
  if (st.kind === "none") return { kind: "desired", type: "出勤" };
  if (st.kind === "want") return st.type === "リモート" ? { kind: "unavailable" } : { kind: "desired", type: "リモート" };
  if (st.kind === "no") return { kind: "clear" };
  return null; // fixed
}

/** "09:00" -> 9, "17:30" -> 17.5 */
export function hourValue(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

export const shortRange = (st: CellState): string | null =>
  st.startTime && st.endTime ? `${Number(st.startTime.slice(0, 2))}-${Number(st.endTime.slice(0, 2))}` : null;

/** 選択キー: "${memberId}__${dateKey}" */
export type SelKey = string;
export const selKey = (memberId: string, dateKey: string): SelKey => `${memberId}__${dateKey}`;
export const parseSelKey = (k: SelKey) => {
  const [memberId, dateKey] = k.split("__");
  return { memberId, dateKey };
};

/** まとめて編集の操作 */
export type BulkOp =
  | { kind: "desired"; type: "出勤" | "リモート" }
  | { kind: "unavailable" }
  | { kind: "clear" }
  | { kind: "confirm" }
  | { kind: "revert" }
  | { kind: "reject" }
  | { kind: "time"; startTime: string | null; endTime: string | null };

export const TIME_CHOICES = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 23; h++) for (const m of ["00", "30"]) out.push(`${String(h).padStart(2, "0")}:${m}`);
  return out;
})();

export const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function daysOfMonth(anchor: Date): Date[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
}

export function monthGridWeeks(anchor: Date): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const cursor = new Date(first);
  cursor.setDate(1 - first.getDay());
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  for (;;) {
    weeks.push(
      Array.from({ length: 7 }, () => {
        const d = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
        return d;
      }),
    );
    if (cursor > monthEnd) break;
  }
  return weeks;
}

export function weekDaysOf(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export const isSameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** 表示時間帯の既定値。Phase 4 でグループ設定から与えられるようにする。 */
export const DISPLAY_START_HOUR = 9;
export const DISPLAY_END_HOUR = 20;

export interface SegmentBox {
  state: CellState;
  /** セル幅に対する左端の位置(%) 0..100 */
  leftPct: number;
  /** セル幅に対する幅(%) 0..100 */
  widthPct: number;
}

/** これより細い枠は潰れて見えないので、最低これだけの幅を確保する。 */
export const MIN_SEGMENT_WIDTH_PCT = 6;

/**
 * セル内に並べるセグメントの位置を、実時間の比率で計算する。
 * - 終日枠（startTime と endTime が両方 null）は leftPct:0 / widthPct:100
 * - 時間枠は表示時間帯を 0..100 にマップする
 * - 表示時間帯からはみ出す部分は 0..100 に丸める
 * - 丸めた結果の幅が MIN_SEGMENT_WIDTH_PCT 未満なら最小幅を確保する（潰れて見えなくなるのを防ぐ）
 * - leftPct + widthPct は必ず 100 以下になる
 * - 戻り値は leftPct の昇順
 */
export function segmentLayout(
  states: CellState[],
  startHour = DISPLAY_START_HOUR,
  endHour = DISPLAY_END_HOUR,
): SegmentBox[] {
  const displayRange = endHour - startHour;
  return states
    .map((state): SegmentBox => {
      if (!state.startTime || !state.endTime) {
        return { state, leftPct: 0, widthPct: 100 };
      }
      const toPct = (h: number) =>
        Math.max(0, Math.min(100, ((h - startHour) / displayRange) * 100));
      let leftPct = toPct(hourValue(state.startTime));
      let widthPct = toPct(hourValue(state.endTime)) - leftPct;
      if (widthPct < MIN_SEGMENT_WIDTH_PCT) {
        widthPct = MIN_SEGMENT_WIDTH_PCT;
        // 最小幅を足すぶん、左に引き戻す。そうしないと表示時間帯の外へ出た枠で
        // leftPct + widthPct が 100 を超え、セルからはみ出して描画される。
        leftPct = Math.min(leftPct, 100 - MIN_SEGMENT_WIDTH_PCT);
      }
      return { state, leftPct, widthPct };
    })
    .sort((a, b) => a.leftPct - b.leftPct);
}

/**
 * セル描画に使う箱を返す。
 * セグメントが1件以下のときは、時間帯を持っていてもセル全体を埋める
 * （従来の見た目を保つため。時間は文字で示す）。2件以上のときだけ、
 * 実時間の比率で横に分割する。
 */
export function cellBoxes(
  states: CellState[],
  startHour = DISPLAY_START_HOUR,
  endHour = DISPLAY_END_HOUR,
): SegmentBox[] {
  if (states.length <= 1) {
    return states.map((state) => ({ state, leftPct: 0, widthPct: 100 }));
  }
  return segmentLayout(states, startHour, endHour);
}

/**
 * セグメント構成の妥当性を検査する。問題があれば日本語のメッセージ、無ければ null。
 * 検査項目（この順でメッセージを返す）:
 *  1. 開始が終了以降 → 「終了時刻は開始時刻より後にしてください」
 *  2. 終日枠が2つ以上 → 「終日の枠は1つまでです」
 *  3. 終日枠と時間枠が混在 → 「終日の枠と時間指定の枠は同時に登録できません」
 *  4. 時間枠どうしが重なる → 「時間帯が重なっています」
 *  5. 件数が max を超える → 「1日に登録できる枠は最大{max}件です」
 * 境界が接するだけ（9-13 と 13-18）は重なりとみなさない。
 */
export function validateSegments(
  segments: { startTime: string | null; endTime: string | null }[],
  max = 4,
): string | null {
  for (const seg of segments) {
    if (seg.startTime && seg.endTime && seg.startTime >= seg.endTime) {
      return "終了時刻は開始時刻より後にしてください";
    }
  }

  const allDayCount = segments.filter((s) => !s.startTime && !s.endTime).length;
  if (allDayCount >= 2) {
    return "終日の枠は1つまでです";
  }

  const hasAllDay = allDayCount === 1;
  const hasTimeFrame = segments.some((s) => s.startTime || s.endTime);
  if (hasAllDay && hasTimeFrame) {
    return "終日の枠と時間指定の枠は同時に登録できません";
  }

  const timeFrames = segments.filter((s) => s.startTime && s.endTime);
  for (let i = 0; i < timeFrames.length; i++) {
    for (let j = i + 1; j < timeFrames.length; j++) {
      const a = timeFrames[i];
      const b = timeFrames[j];
      const aStart = hourValue(a.startTime!);
      const aEnd = hourValue(a.endTime!);
      const bStart = hourValue(b.startTime!);
      const bEnd = hourValue(b.endTime!);
      if (!(aEnd <= bStart || bEnd <= aStart)) {
        return "時間帯が重なっています";
      }
    }
  }

  if (segments.length > max) {
    return `1日に登録できる枠は最大${max}件です`;
  }

  return null;
}

/** タップサイクルで安全に回せる構成か（0件、または終日枠1件のみ） */
export function isSimpleCell(states: CellState[]): boolean {
  if (states.length === 0) return true;
  if (states.length === 1) {
    const s = states[0];
    return !s.startTime && !s.endTime;
  }
  return false;
}
