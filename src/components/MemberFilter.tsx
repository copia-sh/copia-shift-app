import { useMemo } from "react";
import type { Member } from "../types";

export interface MemberFilterProps {
  members: Member[];
  currentMemberId: string;
  showCurrentMemberOnly: boolean;
  selectedAttributes: Set<string>;
  nameQuery: string;
  visibleCount: number;
  hasActiveFilter: boolean;
  onSelectCurrentMember: () => void;
  onChange: (attributes: Set<string>) => void;
  onChangeNameQuery: (query: string) => void;
  onResetFilters: () => void;
}

/** 絞り込みの操作は見た目を揃える。スマホでは44px、PCでは34px。 */
const CHIP =
  "flex-none whitespace-nowrap rounded-full border px-3 text-[15px] font-bold min-h-[44px] flex items-center md:h-[34px] md:min-h-0 md:rounded-md md:px-3 md:text-[14px]";
const CHIP_ON = "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]";
const CHIP_OFF = "border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50";

export function MemberFilter({
  members,
  currentMemberId,
  showCurrentMemberOnly,
  selectedAttributes,
  nameQuery,
  visibleCount,
  hasActiveFilter,
  onSelectCurrentMember,
  onChange,
  onChangeNameQuery,
  onResetFilters,
}: MemberFilterProps) {
  const currentAttributes = useMemo(
    () => new Set(members.find((member) => member.id === currentMemberId)?.attributes ?? []),
    [members, currentMemberId],
  );
  const attributeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members) {
      if (!member.active) continue;
      for (const attribute of member.attributes) {
        counts.set(attribute, (counts.get(attribute) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(([left], [right]) => {
      const ownDifference =
        Number(currentAttributes.has(right)) - Number(currentAttributes.has(left));
      return ownDifference || left.localeCompare(right, "ja");
    });
  }, [members, currentAttributes]);

  const toggle = (attribute: string) => {
    const next = new Set(selectedAttributes);
    if (next.has(attribute)) next.delete(attribute);
    else next.add(attribute);
    onChange(next);
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-nowrap items-center gap-2 overflow-x-auto px-3 pb-2 md:flex-wrap md:overflow-visible md:px-5 md:pb-3">
      <span className="mr-1 flex-none whitespace-nowrap text-[12px] font-bold text-[#6B7280]">
        表示対象 {visibleCount}人
      </span>

      {/* 氏名で直接探せるようにする。人数が増えると属性だけでは絞りきれない。 */}
      <label className="flex-none">
        <input
          type="search"
          value={nameQuery}
          onChange={(event) => onChangeNameQuery(event.target.value)}
          placeholder="氏名で絞り込む"
          aria-label="氏名で絞り込む"
          className="w-[150px] rounded-md border border-[#E5E7EB] bg-white px-3 text-[15px] font-bold text-[#111827] placeholder:font-normal placeholder:text-[#9CA3AF] md:h-[34px] md:w-[180px] md:text-[14px]"
          style={{ minHeight: 44 }}
        />
      </label>

      <button
        type="button"
        onClick={() => onChange(new Set())}
        aria-pressed={!showCurrentMemberOnly && selectedAttributes.size === 0}
        className={`${CHIP} ${
          !showCurrentMemberOnly && selectedAttributes.size === 0 ? CHIP_ON : CHIP_OFF
        }`}
      >
        全員
      </button>
      <button
        type="button"
        onClick={onSelectCurrentMember}
        aria-pressed={showCurrentMemberOnly}
        className={`${CHIP} ${showCurrentMemberOnly ? CHIP_ON : CHIP_OFF}`}
      >
        自分
      </button>

      {attributeCounts.map(([attribute, count]) => {
        const selected = !showCurrentMemberOnly && selectedAttributes.has(attribute);
        return (
          <button
            key={attribute}
            type="button"
            onClick={() => toggle(attribute)}
            aria-pressed={selected}
            title={currentAttributes.has(attribute) ? "自分に設定されている属性" : undefined}
            className={`${CHIP} ${selected ? CHIP_ON : CHIP_OFF}`}
          >
            {attribute}
            <span className="ml-1.5 font-normal opacity-70">{count}人</span>
          </button>
        );
      })}

      {/* 条件がかかっているときだけ出す。常設すると押す必要のないボタンが増える。 */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onResetFilters}
          className={`${CHIP} border-dashed border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50`}
        >
          条件を解除
        </button>
      )}

      {selectedAttributes.size > 1 && !showCurrentMemberOnly && (
        <span className="ml-auto flex-none whitespace-nowrap text-[12px] text-gray-400">
          複数選択はいずれかに該当
        </span>
      )}
    </div>
  );
}
