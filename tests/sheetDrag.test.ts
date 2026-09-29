import { describe, it, expect } from "vitest";
import { dragOffset, settleSheetDrag } from "../src/components/taskBoard/sheetDrag";

describe("settleSheetDrag", () => {
  it("下に大きく引くと閉じる（広げていれば元の高さに戻す）", () => {
    expect(settleSheetDrag(140, false)).toBe("close");
    expect(settleSheetDrag(140, true)).toBe("collapse");
  });

  it("上に引くと広げる", () => {
    expect(settleSheetDrag(-80, false)).toBe("expand");
    expect(settleSheetDrag(-80, true)).toBe("stay");
  });

  it("少し動かしただけなら元に戻る", () => {
    expect(settleSheetDrag(40, false)).toBe("stay");
    expect(settleSheetDrag(-20, false)).toBe("stay");
  });
});

describe("dragOffset", () => {
  it("下へは指に付いて動き、上へは抵抗を付けて少しだけ動く", () => {
    expect(dragOffset(120)).toBe(120);
    expect(dragOffset(-100)).toBe(-30);
    expect(dragOffset(-400)).toBe(-48);
  });
});
