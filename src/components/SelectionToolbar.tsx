import { SHIFT_TYPES, SHIFT_TYPE_STYLE } from "../types";
import type { ShiftType } from "../types";

interface SelectionToolbarProps {
  selectedCount: number;
  onRegister: (type: ShiftType) => void;
  onDeleteOwn: () => void;
  onClear: () => void;
  canDelete: boolean;
  busy: boolean;
}

export function SelectionToolbar({
  selectedCount,
  onRegister,
  onDeleteOwn,
  onClear,
  canDelete,
  busy,
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
        <span className="text-sm font-medium text-gray-700">
          {selectedCount}日 選択中
        </span>
        <div className="flex gap-1">
          {SHIFT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              disabled={busy}
              onClick={() => onRegister(type)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{
                backgroundColor: SHIFT_TYPE_STYLE[type].bg,
                color: SHIFT_TYPE_STYLE[type].text,
                border:
                  type === "未定" ? "1px solid #d1d5db" : "1px solid transparent",
              }}
            >
              {type}で登録
            </button>
          ))}
        </div>
        {canDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={onDeleteOwn}
            className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            自分の希望日を削除
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          選択解除
        </button>
      </div>
    </div>
  );
}
