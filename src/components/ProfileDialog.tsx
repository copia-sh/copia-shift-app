import { useState } from "react";
import { Dialog } from "./Dialog";
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
    <Dialog
      title="表示名の変更"
      onClose={onClose}
      primary={{
        label: "保存",
        onClick: handleSave,
        disabled: busy || displayName.trim().length === 0,
      }}
      secondary={{ label: "キャンセル", onClick: onClose, disabled: busy }}
    >
      <div className="mb-4">
        <label className="mb-1 block text-sm font-bold text-gray-700">メールアドレス</label>
        <div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {member.email}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-bold text-gray-700" htmlFor="profile-display-name">
          表示名
        </label>
        <input
          id="profile-display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          placeholder="表示名を入力してください"
          className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
        />
      </div>
    </Dialog>
  );
}
