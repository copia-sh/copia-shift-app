import type { Member } from "../../types";
import { findMemberForAssignee, UNASSIGNED } from "../../taskBoard";

interface BadgeColors {
  bg: string;
  border: string;
  text: string;
}

/** ステータスの色。色だけで区別しないよう、必ず文字のバッジとして出す。 */
const STATUS_COLORS: Record<string, BadgeColors> = {
  未着手: { bg: "#F4F6F8", border: "#E5E7EB", text: "#4B5563" },
  検討中: { bg: "#FBEEDF", border: "#F3D0AB", text: "#8A5310" },
  未整備: { bg: "#FBEEDF", border: "#F3D0AB", text: "#8A5310" },
  進行中: { bg: "#D1E9F9", border: "#A7D1EE", text: "#0863A0" },
  練習中: { bg: "#D1E9F9", border: "#A7D1EE", text: "#0863A0" },
  // --c-teal の文字は淡い背景で 4.5:1 に届かないので暗くしている
  運用中: { bg: "#E0F0F2", border: "#A5D0D6", text: "#166A75" },
};
const UNKNOWN_STATUS: BadgeColors = STATUS_COLORS.未着手;

export function StatusBadge({ status, large = false }: { status: string; large?: boolean }) {
  const colors = STATUS_COLORS[status] ?? UNKNOWN_STATUS;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 font-bold ${
        large ? "h-6 text-[12px]" : "h-[22px] text-[11px]"
      }`}
      style={{ background: colors.bg, borderColor: colors.border, color: colors.text }}
    >
      {status || "未設定"}
    </span>
  );
}

export function UnassignedCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-dashed border-[#D9736F] bg-[#FDF1F1] px-2 text-[11px] font-bold text-[#A8433F]">
      担当未定 {count}件
    </span>
  );
}

export function PriorityText({ priority }: { priority: string }) {
  if (priority === "最重要") {
    return (
      <span className="inline-flex h-[22px] items-center rounded-full border border-[#F0C7C7] bg-[#FDF1F1] px-2 text-[11px] font-bold text-[#A8433F]">
        最重要
      </span>
    );
  }
  const strong = priority === "高";
  return (
    <span className={`text-[12px] ${strong ? "font-bold text-[#111827]" : "text-[#4B5563]"}`}>
      {priority || "—"}
    </span>
  );
}

/** メンバー色から、アイコンの淡い背景と読める文字色を作る。 */
function avatarColors(color: string): { background: string; color: string } {
  return {
    background: `color-mix(in srgb, ${color} 22%, white)`,
    color: `color-mix(in srgb, ${color} 72%, black)`,
  };
}

interface AssigneeListProps {
  assignees: readonly string[];
  members: readonly Member[];
  size?: number;
}

/** 担当者の並び。メンバーに当たる名前だけアイコンを付け、「全員（毎月入力）」などは文字のまま出す。 */
export function AssigneeList({ assignees, members, size = 18 }: AssigneeListProps) {
  if (assignees.length === 1 && assignees[0] === UNASSIGNED) {
    return (
      <span className="inline-flex h-[22px] w-fit items-center justify-self-start rounded-full border border-dashed border-[#D9736F] bg-[#FDF1F1] px-2 text-[11px] font-bold text-[#A8433F]">
        担当未定
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      {assignees.map((name) => {
        const member = findMemberForAssignee(name, members);
        return (
          <span key={name} className="inline-flex min-w-0 items-center gap-1">
            {member && (
              <span
                aria-hidden
                className="inline-flex flex-none items-center justify-center rounded-full font-bold"
                style={{ width: size, height: size, fontSize: Math.round(size * 0.5), ...avatarColors(member.color) }}
              >
                {name.slice(0, 1)}
              </span>
            )}
            <span className="truncate text-[12px] text-[#374151]">{name}</span>
          </span>
        );
      })}
    </span>
  );
}
