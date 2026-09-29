export function weekDayWidth(memberCount: number): number {
  return Math.max(76, 30 * Math.max(1, memberCount));
}

export function listNameWidth(viewportWidth: number): number {
  return viewportWidth < 768 ? 70 : 148;
}
