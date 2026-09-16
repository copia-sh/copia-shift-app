import type { Member } from "../types";

/**
 * シフト表に並べるメンバーを決める。
 *
 * 絞り込みの判定はここに集約する。一覧・月・週・人数表示がそれぞれの判定を
 * 持つと、同じ条件でも表示が食い違う。
 */
export interface RosterFilter {
  showCurrentMemberOnly: boolean;
  attributes: ReadonlySet<string>;
  nameQuery: string;
}

export const DEFAULT_ROSTER_FILTER: RosterFilter = {
  showCurrentMemberOnly: false,
  attributes: new Set(),
  nameQuery: "",
};

/** 絞り込みを適用して、実際に行として並べるメンバーを返す。 */
export function rosterMembers(
  members: Member[],
  currentMemberId: string,
  filter: RosterFilter,
): Member[] {
  const active = members.filter((member) => member.active);

  // 「自分」は本人を見るための指定なので、属性・氏名の条件より優先する。
  // ここで空になると、条件の組み合わせ次第で自分の行が出せなくなる。
  if (filter.showCurrentMemberOnly) {
    return active.filter((member) => member.id === currentMemberId);
  }

  const query = filter.nameQuery.trim();
  return active.filter((member) => {
    if (filter.attributes.size > 0) {
      if (!member.attributes.some((attribute) => filter.attributes.has(attribute))) return false;
    }
    if (query && !member.displayName.includes(query)) return false;
    return true;
  });
}

/** 条件がかかっているか。「条件を解除」を出すかの判定に使う。 */
export function hasActiveFilter(filter: RosterFilter): boolean {
  return (
    filter.showCurrentMemberOnly || filter.attributes.size > 0 || filter.nameQuery.trim() !== ""
  );
}

/**
 * 0件のときに理由を1文で返す。0件でなければ null。
 * 空の表だけを見せると、条件で隠れているのか誰もいないのかが分からない。
 */
export function emptyRosterReason(
  members: Member[],
  currentMemberId: string,
  filter: RosterFilter,
): string | null {
  if (rosterMembers(members, currentMemberId, filter).length > 0) return null;
  if (members.filter((member) => member.active).length === 0) {
    return "在籍しているメンバーがいません。";
  }
  if (!hasActiveFilter(filter)) return null;
  return "条件に合うメンバーがいません。属性や氏名の条件を外すと表示されます。";
}
