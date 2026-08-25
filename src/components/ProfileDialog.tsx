import { useState } from "react";
import type { Member } from "../types";

export interface ProfileDialogProps {
  member: Member;
  busy: boolean;
  onClose: () => void;
  onSave: (displayName: string) => void;
}

export function ProfileDialog({
  member,
  busy,
  onClose,
  onSave,
}: ProfileDialogProps) {
  const [displayName, setDisplayName] = useState(member.displayName);

  const handleSave = () => {
    const trimmed = displayName.trim();
    if (trimmed.length > 0) {
      onSave(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">表示名の変更</h2>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-1">
            メールアドレス
          </label>
          <div className="px-3 py-2 rounded border border-gray-300 bg-gray-50 text-sm text-gray-500">
            {member.email}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-700 mb-1">
            表示名
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={busy}
            placeholder="表示名を入力してください"
            className="w-full px-3 py-2 rounded border border-gray-300 bg-white text-sm text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || displayName.trim().length === 0}
            className="flex-1 px-4 py-2 text-[12px] font-bold border border-[#248DD4] rounded bg-[#248DD4] text-white hover:bg-[#1B6FA8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
