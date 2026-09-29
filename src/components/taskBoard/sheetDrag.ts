/** 下からのシートを指で動かしたときの決まり。見た目の部品から分けてテストする。 */

/** これより下に引いたら閉じる（広げた状態なら元の高さへ戻す） */
const CLOSE_DISTANCE = 100;
/** これより上に引いたら画面いっぱいに広げる */
const EXPAND_DISTANCE = 60;
/** 上へ引いたときの見た目の動き。シートは上に離れないので、抵抗を付けて少しだけ動かす */
const UPWARD_RESISTANCE = 0.3;
const MAX_UPWARD = 48;

export type SheetDragResult = "close" | "collapse" | "expand" | "stay";

export function settleSheetDrag(deltaY: number, expanded: boolean): SheetDragResult {
  if (deltaY > CLOSE_DISTANCE) return expanded ? "collapse" : "close";
  if (deltaY < -EXPAND_DISTANCE && !expanded) return "expand";
  return "stay";
}

/** ドラッグ中にシートをずらす量（px）。 */
export function dragOffset(deltaY: number): number {
  if (deltaY >= 0) return deltaY;
  return Math.max(-MAX_UPWARD, Math.round(deltaY * UPWARD_RESISTANCE));
}
