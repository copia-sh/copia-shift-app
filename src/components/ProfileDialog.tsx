import { useState } from "react";
import type { Member } from "../types";
import { DIALOG_PRIMARY, DIALOG_SECONDARY, FIELD_LABEL, MODAL_BACKDROP } from "./ui/controls";

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
    <div className={MODAL_BACKDROP}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-ink">表示名の変更</h2>
        </div>

        <div className="mb-4">
          <label className={FIELD_LABEL}>
            メールアドレス
          </label>
          <div className="px-3 py-2 rounded border border-line-strong bg-surface-4 text-sm text-ink-4">
            {member.email}
          </div>
        </div>

        <div className="mb-6">
          <label className={FIELD_LABEL}>
            表示名
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={busy}
            placeholder="表示名を入力してください"
            className="w-full px-3 py-2 rounded border border-line-strong bg-white text-sm text-ink disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={DIALOG_SECONDARY}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || displayName.trim().length === 0}
            className={DIALOG_PRIMARY}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
