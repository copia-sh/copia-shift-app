import { describe, expect, it } from "vitest";
import {
  listNameWidth,
  weekDayWidth,
} from "../src/components/responsiveLayout";

describe("responsive calendar layout", () => {
  it("keeps a compact minimum day width and expands for larger teams", () => {
    expect(weekDayWidth(1)).toBe(76);
    expect(weekDayWidth(2)).toBe(76);
    expect(weekDayWidth(4)).toBe(120);
    expect(weekDayWidth(6)).toBe(180);
  });

  it("reduces the sticky member column below the tablet breakpoint", () => {
    expect(listNameWidth(375)).toBe(70);
    expect(listNameWidth(767)).toBe(70);
    expect(listNameWidth(768)).toBe(148);
  });
});
