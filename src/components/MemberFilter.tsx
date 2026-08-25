import { useMemo } from "react";
import type { Member } from "../types";

export interface MemberFilterProps {
  members: Member[];
  currentMemberId: string;
  showCurrentMemberOnly: boolean;
  selectedAttributes: Set<string>;
  onSelectCurrentMember: () => void;
  onChange: (attributes: Set<string>) => void;
}

export function MemberFilter({
  members,
  currentMemberId,
  showCurrentMemberOnly,
  selectedAttributes,
  onSelectCurrentMember,
  onChange,
}: MemberFilterProps) {
  const currentAttributes = useMemo(
    () => new Set(members.find((member) => member.id === currentMemberId)?.attributes ?? []),
    [members, currentMemberId],
  );
  const attributeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members) {
      for (const attribute of member.attributes) {
        counts.set(attribute, (counts.get(attribute) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(([left], [right]) => {
      const ownDifference = Number(currentAttributes.has(right)) - Number(currentAttributes.has(left));
      return ownDifference || left.localeCompare(right, "ja");
    });
  }, [members, currentAttributes]);

  const visibleCount = showCurrentMemberOnly
    ? members.filter((member) => member.id === currentMemberId).length
    : members.filter(
        (member) =>
          selectedAttributes.size === 0 ||
          member.attributes.some((attribute) => selectedAttributes.has(attribute)),
      ).length;

  const toggle = (attribute: string) => {
    const next = new Set(selectedAttributes);
    if (next.has(attribute)) next.delete(attribute);
    else next.add(attribute);
    onChange(next);
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-5 pb-3">
      <span className="mr-1 text-[12px] font-bold text-[#6B7280]">
        表示対象（{visibleCount}人）
      </span>
      <button
        type="button"
        onClick={() => onChange(new Set())}
        aria-pressed={!showCurrentMemberOnly && selectedAttributes.size === 0}
        className={`rounded-full border px-3 py-1 text-[12px] font-bold ${
          !showCurrentMemberOnly && selectedAttributes.size === 0
            ? "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        全員
      </button>
      <button
        type="button"
        onClick={onSelectCurrentMember}
        aria-pressed={showCurrentMemberOnly}
        className={`rounded-full border px-3 py-1 text-[12px] font-bold ${
          showCurrentMemberOnly
            ? "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        自分だけ
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
            className={`rounded-full border px-3 py-1 text-[12px] font-bold ${
              selected
                ? "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {attribute} ({count})
          </button>
        );
      })}
      {selectedAttributes.size > 1 && !showCurrentMemberOnly && (
        <span className="ml-auto text-[11px] text-gray-400">複数選択はいずれかに該当</span>
      )}
    </div>
  );
}
