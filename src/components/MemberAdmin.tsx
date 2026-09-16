import { useState } from "react";
import { Dialog } from "./Dialog";
import { normalizeMemberAttributes, type Member, type MemberRole } from "../types";

export interface MemberAdminProps {
  members: Member[];
  currentMemberId: string;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onChangeRole: (memberId: string, role: MemberRole) => void;
  onChangeActive: (memberId: string, active: boolean) => void;
  onChangeShiftTarget: (memberId: string, shiftTarget: boolean) => void;
  onChangeDisplayName: (memberId: string, displayName: string) => void;
  onChangeAttributes: (memberId: string, attributes: string[]) => void;
}

export function MemberAdmin({
  members,
  currentMemberId,
  canManage,
  busy,
  onClose,
  onChangeRole,
  onChangeActive,
  onChangeShiftTarget,
  onChangeDisplayName,
  onChangeAttributes,
}: MemberAdminProps) {
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  // 自分をシフト対象外にするときだけ確認を挟む。誤操作で自分の入力欄を
  // 消してしまうと、原因が分からないまま希望を出せなくなる。
  const [confirmingSelfOff, setConfirmingSelfOff] = useState(false);
  const [newAttributes, setNewAttributes] = useState<Record<string, string>>({});
  const availableAttributes = normalizeMemberAttributes(
    members.flatMap((member) => member.attributes),
  );

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

  const toggleAttribute = (member: Member, attribute: string) => {
    const next = member.attributes.includes(attribute)
      ? member.attributes.filter((value) => value !== attribute)
      : normalizeMemberAttributes([...member.attributes, attribute]);
    onChangeAttributes(member.id, next);
  };

  const addAttribute = (member: Member) => {
    const [attribute] = normalizeMemberAttributes([newAttributes[member.id] ?? ""]);
    if (!attribute) return;
    if (!member.attributes.includes(attribute)) {
      onChangeAttributes(member.id, normalizeMemberAttributes([...member.attributes, attribute]));
    }
    setNewAttributes((current) => {
      const copy = { ...current };
      delete copy[member.id];
      return copy;
    });
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

          {/* 在籍（退会したか）とシフト対象（希望を出す人か）は別の設定。
              社員のように希望を出さない人を、在籍のままシフト表から外す。 */}
          <button
            type="button"
            onClick={() => {
              if (member.shiftTarget && isCurrentUser) {
                setConfirmingSelfOff(true);
                return;
              }
              onChangeShiftTarget(member.id, !member.shiftTarget);
            }}
            disabled={busy || !canManage}
            aria-pressed={member.shiftTarget}
            className={`h-[34px] rounded-full border px-3 text-[13px] font-bold disabled:opacity-50 ${
              member.shiftTarget
                ? "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]"
                : "border-[#E5E7EB] bg-white text-[#6B7280]"
            }`}
          >
            {member.shiftTarget ? "シフト対象" : "シフト対象外"}
          </button>

          {isCurrentUser && (
            <span className="text-[11px] text-gray-400">自分のロールは変更できません</span>
          )}
          {cannotDeactivate && (
            <span className="text-[11px] text-gray-400">最後の管理者は外せません</span>
          )}
        </div>

        <p className="pl-5 text-[11px] text-gray-400">
          {member.shiftTarget
            ? "シフト表に表示・登録する"
            : "シフト表に出さない（登録もしない）。過去に登録した予定は残り、書き出しからも消えません。"}
        </p>

        {isCurrentUser && confirmingSelfOff && member.shiftTarget && (
          <div className="ml-5 rounded-md border border-[#F0C7C7] bg-[#FDF1F1] p-2.5">
            <p className="text-[12px] font-bold text-[#D9736F]">
              自分をシフト対象外にすると、自分の行と希望の入力欄が出なくなります。よろしいですか？
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onChangeShiftTarget(member.id, false);
                  setConfirmingSelfOff(false);
                }}
                disabled={busy}
                className="h-9 flex-1 rounded-md border border-[#D9736F] bg-[#D9736F] px-3 text-[12px] font-bold text-white disabled:opacity-50"
              >
                対象外にする
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSelfOff(false)}
                className="h-9 flex-1 rounded-md border border-gray-300 bg-white px-3 text-[12px] font-bold text-gray-700"
              >
                やめる
              </button>
            </div>
          </div>
        )}

        <div className="pl-5">
          <span className="mb-1.5 block text-[11px] font-bold text-gray-500">属性タグ</span>
          <div className="flex flex-wrap gap-1.5">
            {availableAttributes.length === 0 && (
              <span className="text-[11px] text-gray-400">まだ属性がありません</span>
            )}
            {availableAttributes.map((attribute) => {
              const selected = member.attributes.includes(attribute);
              return (
                <button
                  key={attribute}
                  type="button"
                  onClick={() => toggleAttribute(member, attribute)}
                  disabled={busy || !canManage}
                  aria-pressed={selected}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${
                    selected
                      ? "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {selected ? "✓ " : ""}{attribute}
                </button>
              );
            })}
          </div>
          {canManage && (
            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={newAttributes[member.id] ?? ""}
                onChange={(e) =>
                  setNewAttributes({ ...newAttributes, [member.id]: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAttribute(member);
                  }
                }}
                disabled={busy}
                placeholder="新しい属性"
                className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-900 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => addAttribute(member)}
                disabled={busy || !(newAttributes[member.id] ?? "").trim()}
                className="rounded border border-[#248DD4] bg-white px-2.5 py-1 text-[11px] font-bold text-[#248DD4] disabled:opacity-40"
              >
                追加
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog title="メンバー管理" onClose={onClose}>


        {!canManage && (
          <p className="mb-3 rounded-md bg-[#D1E9F9] px-3 py-2 text-[11px] font-bold text-[#0863A0]">
            表示名・役職・在籍・シフト対象・属性タグの変更は管理者のみ行えます
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
            data-autofocus
            onClick={onClose}
            disabled={busy}
            className="w-full px-4 py-2 text-[12px] font-bold border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            閉じる
          </button>
        </div>
    </Dialog>
  );
}
