import { describe, expect, it } from "vitest";
import {
  listNameWidth,
  monthCellMinHeight,
  monthMemberColumns,
  weekDayWidth,
} from "../src/components/responsiveLayout";

describe("responsive calendar layout", () => {
  it.each([
    [1, 1],
    [2, 2],
    [4, 2],
    [6, 3],
  ])("%i visible members use %i columns", (members, columns) => {
    expect(monthMemberColumns(members)).toBe(columns);
  });

  it("grows the month cell only when another member row is needed", () => {
    expect(monthCellMinHeight(1)).toBe(90);
    expect(monthCellMinHeight(2)).toBe(90);
    expect(monthCellMinHeight(3)).toBe(146);
    expect(monthCellMinHeight(4)).toBe(146);
    expect(monthCellMinHeight(6)).toBe(146);
  });

  it("keeps a compact minimum day width and expands for larger teams", () => {
    expect(weekDayWidth(1)).toBe(76);
    expect(weekDayWidth(2)).toBe(76);
    expect(weekDayWidth(4)).toBe(120);
    expect(weekDayWidth(6)).toBe(180);
  });

  it("reduces the sticky member column below the tablet breakpoint", () => {
    expect(listNameWidth(375)).toBe(96);
    expect(listNameWidth(767)).toBe(96);
    expect(listNameWidth(768)).toBe(132);
  });
});
