import { DEFAULT_ROSTER_FILTER, type RosterFilter } from "../components/memberRoster";

/**
 * 絞り込み条件はグループごとに保存する。別のグループへ条件が持ち越されると、
 * 「予定が消えた」と誤解する原因になる。localStorage はプライベートブラウズ等で
 * 例外を投げうるので、読み書きとも失敗しても動作に影響させない。
 */
const KEY_PREFIX = "copia-shift:roster-filter:";

interface StoredFilter {
  showCurrentMemberOnly?: boolean;
  attributes?: string[];
  nameQuery?: string;
  includeNonTargets?: boolean;
}

export function readRosterFilter(groupId: string): RosterFilter {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + groupId);
    if (!raw) return DEFAULT_ROSTER_FILTER;
    const parsed = JSON.parse(raw) as StoredFilter;
    return {
      showCurrentMemberOnly: parsed.showCurrentMemberOnly ?? false,
      attributes: new Set(Array.isArray(parsed.attributes) ? parsed.attributes : []),
      nameQuery: typeof parsed.nameQuery === "string" ? parsed.nameQuery : "",
      includeNonTargets: parsed.includeNonTargets ?? false,
    };
  } catch {
    return DEFAULT_ROSTER_FILTER;
  }
}

export function storeRosterFilter(groupId: string, filter: RosterFilter): void {
  try {
    const payload: StoredFilter = {
      showCurrentMemberOnly: filter.showCurrentMemberOnly,
      attributes: [...filter.attributes],
      nameQuery: filter.nameQuery,
      includeNonTargets: filter.includeNonTargets,
    };
    localStorage.setItem(KEY_PREFIX + groupId, JSON.stringify(payload));
  } catch {
    /* 保存できなくても動作に影響はない */
  }
}
