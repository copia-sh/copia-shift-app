import type { CellState } from "./shiftVisual";
import type { ShiftTypeDef } from "../types";
import { REJECTED_TYPE } from "../types";

/** "#RRGGBB" を 0..1 の比率で混ぜる。t=0 で a、t=1 で b。 */
export function mixHex(a: string, b: string, t: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  t = clamp(t);
  const parseColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const blue = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, blue };
  };
  const a_rgb = parseColor(a);
  const b_rgb = parseColor(b);
  const r = Math.round((a_rgb.r * (1 - t) + b_rgb.r * t) * 255);
  const g = Math.round((a_rgb.g * (1 - t) + b_rgb.g * t) * 255);
  const blue = Math.round((a_rgb.blue * (1 - t) + b_rgb.blue * t) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

export function lighten(hex: string, t: number): string {
  return mixHex(hex, "#ffffff", t);
}

export function darken(hex: string, t: number): string {
  return mixHex(hex, "#000000", t);
}

export interface Skin {
  bg: string;
  border: string;
  borderStyle: "solid" | "dashed";
  borderWidth: string;
  fg: string;
  shadow: string;
  mark: string;
  label: string;
}

/** React の style に渡せる形にする */
export function skinStyle(sk: Skin): React.CSSProperties {
  const result: React.CSSProperties = {
    backgroundColor: sk.bg,
    borderColor: sk.border,
    borderStyle: sk.borderStyle,
    borderWidth: sk.borderWidth,
    color: sk.fg,
  };
  if (sk.shadow) {
    result.boxShadow = sk.shadow;
  }
  return result;
}

export interface ShiftTheme {
  types: ShiftTypeDef[];
  /** key から定義を引く。未知のキー（削除された種別を参照している古いデータ）でも
   *  必ず何か返す。その場合は label にキーをそのまま入れ、色はグレーにする。 */
  defOf(key: string): ShiftTypeDef;
  /** セルの見た目。selected のときは背景を一段濃くする（既存の boxSelected 相当） */
  skinFor(state: CellState, selected: boolean): Skin;
  /** タップサイクルの順序。available な種別を定義順に回り、最後に unavailable の先頭、そして未回答へ戻る */
  cycleKeys: string[];
  /** 「不可」として扱うキーの集合（unavailable な種別 + 予約語 "却下"） */
  unavailableKeys: Set<string>;
}

export function buildShiftTheme(types: ShiftTypeDef[]): ShiftTheme {
  const typeMap = new Map(types.map((t) => [t.key, t]));

  const defOf = (key: string): ShiftTypeDef => {
    if (typeMap.has(key)) {
      return typeMap.get(key)!;
    }
    // 「却下」は種別一覧には出さない予約語だが、却下操作で必ず作られるので
    // 定義を持たせる。ここを外すと灰色の「?」で表示されてしまう。
    if (key === REJECTED_TYPE) {
      return {
        key,
        label: "却下",
        color: "#D9736F",
        attendance: "unavailable",
        mark: "×",
      };
    }
    // 管理者が削除した種別を参照している古いシフト。何だったかは復元できないので、
    // 種別名をそのまま出して「今は無い種別」だと分かるようにする。
    // attendance は "available" にしておく: セルの状態(希望/不可)を決めるのは
    // unavailableKeys の方で、未知キーはそこに含まれないため希望として扱われる。
    // ここで "unavailable" と申告すると、見た目と分類が食い違う。
    return {
      key,
      label: key,
      color: "#999999",
      attendance: "available",
      mark: "?",
    };
  };

  const cycleKeys = types.filter((t) => t.attendance === "available").map((t) => t.key);
  const firstUnavailable = types.find((t) => t.attendance === "unavailable");
  if (firstUnavailable) {
    cycleKeys.push(firstUnavailable.key);
  }

  const unavailableKeys = new Set<string>();
  types.forEach((t) => {
    if (t.attendance === "unavailable") {
      unavailableKeys.add(t.key);
    }
  });
  unavailableKeys.add(REJECTED_TYPE);

  const skinFor = (state: CellState, selected: boolean): Skin => {
    if (state.kind === "none") {
      const bg = selected ? lighten("#248DD4", 0.88) : "#ffffff";
      return {
        bg,
        border: "#E3E3E3",
        borderStyle: "dashed",
        borderWidth: "1px",
        fg: "#C8CDD2",
        shadow: "",
        mark: "·",
        label: "未回答",
      };
    }

    const def = defOf(state.type);
    const baseColor = def.color;

    if (state.kind === "fixed") {
      // 確定はもともとベタ塗りなので、選択中は「濃くする」方向にずらす。
      // ベース色どうしを混ぜても同じ色にしかならず、選択が判別できなくなる。
      const bg = selected ? darken(baseColor, 0.22) : baseColor;
      return {
        bg,
        border: bg,
        borderStyle: "solid",
        borderWidth: "1px",
        fg: "#ffffff",
        shadow: `0 2px 0 0 ${darken(baseColor, 0.4)}`,
        mark: "✓",
        label: def.label,
      };
    }

    if (state.kind === "want") {
      const baseLight = lighten(baseColor, 0.88);
      const bg = selected ? mixHex(baseLight, baseColor, 0.35) : baseLight;
      return {
        bg,
        border: baseColor,
        borderStyle: "dashed",
        borderWidth: "1.5px",
        fg: darken(baseColor, 0.28),
        shadow: "",
        mark: def.mark,
        label: `${def.label}希望`,
      };
    }

    if (state.kind === "no") {
      const baseLight = lighten(baseColor, 0.90);
      const bg = selected ? mixHex(baseLight, baseColor, 0.35) : baseLight;
      const label = state.type === REJECTED_TYPE ? "却下" : def.label;
      return {
        bg,
        border: lighten(baseColor, 0.55),
        borderStyle: "solid",
        borderWidth: "1px",
        fg: baseColor,
        shadow: "",
        mark: def.mark,
        label,
      };
    }

    return {
      bg: "#ffffff",
      border: "#E3E3E3",
      borderStyle: "dashed",
      borderWidth: "1px",
      fg: "#C8CDD2",
      shadow: "",
      mark: "·",
      label: "未回答",
    };
  };

  return {
    types,
    defOf,
    skinFor,
    cycleKeys,
    unavailableKeys,
  };
}
