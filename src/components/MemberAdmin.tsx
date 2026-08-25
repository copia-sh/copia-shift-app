import { useState } from "react";
import type { Member, MemberRole } from "../types";

export interface MemberAdminProps {
  members: Member[];
  currentMemberId: string;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onChangeRole: (memberId: string, role: MemberRole) => void;
  onChangeActive: (memberId: string, active: boolean) => void;
  onChangeDisplayName: (memberId: string, displayName: string) => void;
}

export function MemberAdmin({
  members,
  currentMemberId,
  canManage,
  busy,
  onClose,
  onChangeRole,
  onChangeActive,
  onChangeDisplayName,
}: MemberAdminProps) {
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});

  const adminCount = members.filter((m) => m.role === "admin" && m.active).length;
  const isOnlyAdmin =
    adminCount === 1 &&
    members.find((m) => m.id === currentMemberId)?.role === "admin";

  const activeMembers = members.filter((m) => m.active).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  const inactiveMembers = members.filter((m) => !m.active).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  const handleDisplayNameBlur = (memberId: string, originalName: string) => {
    const edited = editedNames[memberId];
    if (edited !== undefined && edited !== originalName && edited.trim().length > 0) {
      onChangeDisplayName(memberId, edited.trim());
      const newEditedNames = { ...editedNames };
      delete newEditedNames[memberId];
      setEditedNames(newEditedNames);
    }
  };

  const renderMemberRow = (member: Member) => {
    const isCurrentUser = member.id === currentMemberId;
    const cannotDeactivate = isOnlyAdmin && isCurrentUser;
    const displayName = editedNames[member.id] ?? member.displayName;

    return (
      <div
        key={member.id}
        className={`flex flex-col gap-2 border-b border-gray-200 px-1 py-3 ${
          !member.active ? "opacity-50" : ""
        }`}
      >
        {/* 1行目: 色 + 表示名 + メール。2行目: ロールと在籍。
            1行に詰めるとモーダル幅を超えて操作できなくなるため2段に分ける。 */}
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 flex-none rounded-full"
            style={{ backgroundColor: member.color }}
          />
          <input
            type="text"
            value={displayName}
            onChange={(e) => setEditedNames({ ...editedNames, [member.id]: e.target.value })}
            onBlur={() => handleDisplayNameBlur(member.id, member.displayName)}
            disabled={busy || !canManage}
            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 disabled:opacity-50"
          />
          <span className="max-w-[45%] truncate text-[11px] text-gray-400">{member.email}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pl-5">
          <select
            value={member.role}
            onChange={(e) => onChangeRole(member.id, e.target.value as MemberRole)}
            disabled={busy || !canManage || isCurrentUser}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-[13px] text-gray-900 disabled:opacity-50"
          >
            <option value="admin">管理者</option>
            <option value="leader">リーダー</option>
            <option value="member">メンバー</option>
          </select>

          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={member.active}
              onChange={(e) => onChangeActive(member.id, e.target.checked)}
              disabled={busy || !canManage || cannotDeactivate}
              className="h-4 w-4 disabled:opacity-50"
            />
            <span className="text-[13px] text-gray-700">在籍</span>
          </label>

          {isCurrentUser && (
            <span className="text-[11px] text-gray-400">自分のロールは変更できません</span>
          )}
          {cannotDeactivate && (
            <span className="text-[11px] text-gray-400">最後の管理者は外せません</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl flex flex-col max-h-[80vh]">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">メンバー管理</h2>
        </div>

        {!canManage && (
          <p className="mb-3 rounded-md bg-[#D1E9F9] px-3 py-2 text-[11px] font-bold text-[#0863A0]">
            表示名・役職・在籍の変更は管理者のみ行えます
          </p>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {activeMembers.map(renderMemberRow)}
          {inactiveMembers.length > 0 && (
            <>
              <div className="text-xs font-bold text-gray-500 px-3 py-2 mt-2">
                退会済みメンバー
              </div>
              {inactiveMembers.map(renderMemberRow)}
            </>
          )}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-full px-4 py-2 text-[12px] font-bold border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
