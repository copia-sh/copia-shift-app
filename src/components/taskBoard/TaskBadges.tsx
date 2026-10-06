import type { Member } from "../../types";
import { findMemberForAssignee, UNASSIGNED } from "../../taskBoard";

/** ステータスの色。色だけで区別しないよう、必ず文字のバッジとして出す。 */
const STATUS_COLORS: Record<string, string> = {
  未着手: "bg-line-4 border-line text-ink-3",
  検討中: "bg-orange-wash border-orange-line text-orange-deep",
  未整備: "bg-orange-wash border-orange-line text-orange-deep",
  進行中: "bg-brand-tint border-brand-line text-brand-deep",
  練習中: "bg-brand-tint border-brand-line text-brand-deep",
  // --c-teal の文字は淡い背景で 4.5:1 に届かないので暗くしている
  運用中: "bg-teal-wash border-teal-line text-teal-deep",
};
const UNKNOWN_STATUS = STATUS_COLORS.未着手;

export function StatusBadge({ status, large = false }: { status: string; large?: boolean }) {
  const colors = STATUS_COLORS[status] ?? UNKNOWN_STATUS;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 font-bold ${
        large ? "h-6 text-[12px]" : "h-[22px] text-[11px]"
      } ${colors}`}
    >
      {status || "未設定"}
    </span>
  );
}

export function UnassignedCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-dashed border-coral bg-coral-wash px-2 text-[11px] font-bold text-coral-deep">
      担当未定 {count}件
    </span>
  );
}

export function PriorityText({ priority }: { priority: string }) {
  if (priority === "最重要") {
    return (
      <span className="inline-flex h-[22px] items-center rounded-full border border-coral-line bg-coral-wash px-2 text-[11px] font-bold text-coral-deep">
        最重要
      </span>
    );
  }
  const strong = priority === "高";
  return (
    <span className={`text-[12px] ${strong ? "font-bold text-ink" : "text-ink-3"}`}>
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
      <span className="inline-flex h-[22px] w-fit items-center justify-self-start rounded-full border border-dashed border-coral bg-coral-wash px-2 text-[11px] font-bold text-coral-deep">
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
            <span className="truncate text-[12px] text-ink-2">{name}</span>
          </span>
        );
      })}
    </span>
  );
}
