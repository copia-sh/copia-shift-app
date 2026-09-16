import type { Member } from "../types";

/**
 * シフト表に出す人を決める。
 *
 * 「在籍しているか（active）」と「シフトを登録する人か（shiftTarget）」は別の話。
 * 社員のように希望を出さない人は、在籍したままシフト表から外す。ここを1か所に
 * まとめておかないと、一覧・月・週・人数要約・希望入力で対象がずれる。
 */
export function shiftTargetMembers(members: Member[]): Member[] {
  return members.filter((member) => member.active && member.shiftTarget);
}

export interface RosterFilter {
  showCurrentMemberOnly: boolean;
  attributes: ReadonlySet<string>;
  nameQuery: string;
  /** シフト対象外のメンバーも行として出すか */
  includeNonTargets: boolean;
}

export const DEFAULT_ROSTER_FILTER: RosterFilter = {
  showCurrentMemberOnly: false,
  attributes: new Set(),
  nameQuery: "",
  includeNonTargets: false,
};

/** 絞り込みを適用して、実際に行として並べるメンバーを返す。 */
export function rosterMembers(
  members: Member[],
  currentMemberId: string,
  filter: RosterFilter,
): Member[] {
  const active = members.filter((member) => member.active);

  // 「自分」は本人を見るための指定なので、属性・氏名・対象外の条件より優先する。
  // ここで空になると、シフト対象外の管理者が自分の画面を開けなくなる。
  if (filter.showCurrentMemberOnly) {
    return active.filter((member) => member.id === currentMemberId);
  }

  const query = filter.nameQuery.trim();
  return active.filter((member) => {
    if (!member.shiftTarget && !filter.includeNonTargets) return false;
    if (filter.attributes.size > 0) {
      if (!member.attributes.some((attribute) => filter.attributes.has(attribute))) return false;
    }
    if (query && !member.displayName.includes(query)) return false;
    return true;
  });
}

export interface RosterCounts {
  visible: number;
  /** 在籍しているがシフト対象外の人数 */
  nonTarget: number;
}

export function rosterCounts(
  members: Member[],
  currentMemberId: string,
  filter: RosterFilter,
): RosterCounts {
  return {
    visible: rosterMembers(members, currentMemberId, filter).length,
    nonTarget: members.filter((member) => member.active && !member.shiftTarget).length,
  };
}

/**
 * 0件のときに、なぜ出ていないのかを1文で返す。0件でなければ null。
 * 「絞り込んだ属性の人が全員シフト対象外」は迷いやすいので、別の文にする。
 */
export function emptyRosterReason(
  members: Member[],
  currentMemberId: string,
  filter: RosterFilter,
): string | null {
  if (rosterMembers(members, currentMemberId, filter).length > 0) return null;

  if (!filter.includeNonTargets && filter.attributes.size > 0) {
    const matched = members.filter(
      (member) =>
        member.active && member.attributes.some((attribute) => filter.attributes.has(attribute)),
    );
    if (matched.length > 0 && matched.every((member) => !member.shiftTarget)) {
      const names = [...filter.attributes].map((attribute) => `「${attribute}」`).join("・");
      return `${names}はシフト対象外に設定されているため、この表には出ません。`;
    }
  }

  return "条件に合うメンバーがいません。属性や氏名の条件を外すと表示されます。";
}
