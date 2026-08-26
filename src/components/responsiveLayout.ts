export function monthMemberColumns(memberCount: number): number {
  if (memberCount <= 1) return 1;
  if (memberCount <= 4) return 2;
  return 3;
}

export function monthCellMinHeight(memberCount: number, comfortable = false): number {
  const rows = Math.max(1, Math.ceil(memberCount / monthMemberColumns(memberCount)));
  return 38 + rows * (comfortable ? 56 : 52) + Math.max(0, rows - 1) * 4;
}

export function weekDayWidth(memberCount: number): number {
  return Math.max(76, 30 * Math.max(1, memberCount));
}

export function listNameWidth(viewportWidth: number): number {
  return viewportWidth < 768 ? 96 : 132;
}
