import { describe, expect, it } from "vitest";
import {
  LIST_DAY_WIDTH,
  LIST_ROW_EXPANDED,
  MAX_INLINE_SEGMENTS,
  WEEK_TIME_COL_WIDTH,
  listNameWidth,
  listRowHeight,
  monthCellMinHeight,
  monthMemberColumns,
  monthSummaryDefault,
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

  it("月セルは人ごと118px・要約122px", () => {
    expect(monthCellMinHeight()).toBe(118);
    expect(monthCellMinHeight(true)).toBe(122);
  });

  it("週の日幅は人数に比例させない（人が増えても枠を細くしない）", () => {
    expect(weekDayWidth()).toBe(120);
  });

  it("氏名列はタブレット未満だけ狭める", () => {
    expect(listNameWidth(375)).toBe(96);
    expect(listNameWidth(767)).toBe(96);
    expect(listNameWidth(768)).toBe(168);
  });

  it("行高は密度で切り替える", () => {
    expect(listRowHeight()).toBe(50);
    expect(listRowHeight("comfortable")).toBe(50);
    expect(listRowHeight("compact")).toBe(40);
  });

  it("月の要約は人数が多いときだけ既定にする", () => {
    expect(monthSummaryDefault(12)).toBe(false);
    expect(monthSummaryDefault(18)).toBe(false);
    expect(monthSummaryDefault(19)).toBe(true);
    expect(monthSummaryDefault(30)).toBe(true);
  });

  it("並べる上限と寸法が計画どおり", () => {
    expect(MAX_INLINE_SEGMENTS).toBe(2);
    expect(LIST_DAY_WIDTH).toBe(56);
    expect(LIST_ROW_EXPANDED).toBe(116);
    expect(WEEK_TIME_COL_WIDTH).toBe(56);
  });
});
