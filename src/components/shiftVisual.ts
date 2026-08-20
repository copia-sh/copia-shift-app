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

export function cellStateOf(entry: ShiftEntry | undefined): CellState {
  if (!entry) return { kind: "none", type: "未定", startTime: null, endTime: null };
  const base = { type: entry.type, startTime: entry.startTime, endTime: entry.endTime, entry };
  if (entry.status === "confirmed") return { kind: "fixed", ...base };
  if (entry.type === "欠勤") return { kind: "no", ...base };
  return { kind: "want", ...base };
}

export interface Skin {
  box: string;
  fg: string;
  sub: string;
  mark: string;
  label: string;
}

/** 出勤=ブランドブルー / リモート=ティール / 不可=コーラル。確定はベタ塗り+押し込みシャドウ、希望は淡色+破線。 */
export const SKINS = {
  fixedWork: {
    box: "bg-[#248DD4] border border-[#248DD4] shadow-[0_2px_0_0_#0863A0]",
    fg: "text-white",
    sub: "text-white/90",
    mark: "✓",
    label: "出勤",
  },
  fixedRemote: {
    box: "bg-[#1F8A98] border border-[#1F8A98] shadow-[0_2px_0_0_#14646E]",
    fg: "text-white",
    sub: "text-white/90",
    mark: "R",
    label: "リモート",
  },
  wantWork: {
    box: "bg-[#EAF5FD] border-[1.5px] border-dashed border-[#248DD4]",
    fg: "text-[#0863A0]",
    sub: "text-[#0863A0]/85",
    mark: "○",
    label: "出勤希望",
  },
  wantRemote: {
    box: "bg-[#E6F4F5] border-[1.5px] border-dashed border-[#1F8A98]",
    fg: "text-[#14646E]",
    sub: "text-[#14646E]/85",
    mark: "R",
    label: "リモート希望",
  },
  no: {
    box: "bg-[#FDF1F1] border border-[#F0C7C7]",
    fg: "text-[#D9736F]",
    sub: "text-[#D9736F]",
    mark: "×",
    label: "不可",
  },
  none: {
    box: "bg-white border border-dashed border-[#E3E3E3]",
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
