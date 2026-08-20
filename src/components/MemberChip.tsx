import type { Member, ShiftEntry } from "../types";
import { SHIFT_TYPE_STYLE } from "../types";

interface MemberChipProps {
  member: Member;
  entry: ShiftEntry;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/** Small chip shown inside a calendar day cell: color = shift type, label = member, border = confirmed vs desired. */
export function MemberChip({ member, entry, selected, onClick }: MemberChipProps) {
  const style = SHIFT_TYPE_STYLE[entry.type];
  const isConfirmed = entry.status === "confirmed";

  return (
    <button
      type="button"
      onClick={(e) => onClick?.(e)}
      title={`${member.name} - ${entry.type}${isConfirmed ? "(確定)" : "(希望)"}`}
      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight transition"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: isConfirmed
          ? `1.5px solid ${selected ? "#111827" : "transparent"}`
          : `1.5px dashed ${selected ? "#111827" : "#9ca3af"}`,
        opacity: isConfirmed ? 1 : 0.85,
      }}
    >
      <span className="truncate">{member.name}</span>
    </button>
  );
}
