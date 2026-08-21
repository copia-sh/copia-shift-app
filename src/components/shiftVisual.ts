import type { ShiftEntry, ShiftType } from "../types";

/** 表示状態: 未回答 / 希望 / 不可 / 確定（希望・確定は 出勤 か リモート の2種） */
export type CellKind = "none" | "want" | "no" | "fixed";
export interface CellState {
  kind: CellKind;
  type: ShiftType; // 出勤 | リモート | 欠勤 | 未定
  startTime: string | null;
  endTime: string | null;
  entry?: ShiftEntry;
}

/** セルタップの意味を切り替えるモード */
export type ShiftMode = "single" | "multi" | "review";

export function cellStateOf(entry: ShiftEntry | undefined): CellState {
  if (!entry) return { kind: "none", type: "未定", startTime: null, endTime: null };
  const base = { type: entry.type, startTime: entry.startTime, endTime: entry.endTime, entry };
  if (entry.status === "confirmed") return { kind: "fixed", ...base };
  if (entry.type === "欠勤") return { kind: "no", ...base };
  return { kind: "want", ...base };
}

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
