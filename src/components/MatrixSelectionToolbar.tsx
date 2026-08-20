interface MatrixSelectionToolbarProps {
  selectedCount: number;
  ownNoneCount: number;
  wantCount: number;
  busy: boolean;
  onRegisterOwn: () => void;
  onConfirmSelected: () => void;
  onCancelSelected: () => void;
  onClear: () => void;
}

/** 選択モード中に表示するツールバー。自分の未回答セルは希望登録、申請中(希望)セルは確定/却下ができる。 */
export function MatrixSelectionToolbar({
  selectedCount,
  ownNoneCount,
  wantCount,
  busy,
  onRegisterOwn,
  onConfirmSelected,
  onCancelSelected,
  onClear,
}: MatrixSelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
        <span className="text-sm font-medium text-gray-700">
          {selectedCount}件 選択中
        </span>
        {ownNoneCount > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={onRegisterOwn}
            className="rounded-md bg-[#EAF5FD] px-3 py-1.5 text-xs font-bold text-[#0863A0] disabled:opacity-50"
          >
            自分の{ownNoneCount}件を希望として登録
          </button>
        )}
        {wantCount > 0 && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmSelected}
              className="rounded-md bg-[#248DD4] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              希望{wantCount}件を確定
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancelSelected}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-50"
            >
              希望{wantCount}件を却下
            </button>
          </>
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
