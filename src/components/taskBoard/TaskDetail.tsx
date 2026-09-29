import { useEffect, useState } from "react";
import { DetailContent, SheetLink, type DetailProps } from "./taskDetailParts";
import { eyebrow, LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./taskDetailStyles";

export type { DetailItem } from "./taskDetailParts";

/** PC の右パネル。シフト画面の詳細パネルと同じ位置・型。 */
export function TaskDetailPanel({ item, members, sourceUrl, onClose, onSubmitUpdate }: DetailProps) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 入力中の Escape はまず編集をやめる。2回目でパネルを閉じる
      if (editing) setEditing(false);
      else onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, editing]);

  return (
    <aside
      aria-label={`${eyebrow(item)}の詳細`}
      className="sticky top-4 w-[340px] flex-none self-start overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
    >
      <header className="flex items-start gap-3 border-b border-[#F1F3F5] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className={LABEL}>{editing ? `${eyebrow(item)}の進捗を更新` : eyebrow(item)}</p>
          <h2 className="mt-0.5 text-[14px] font-bold leading-[1.5] text-[#111827]">{item.title}</h2>
        </div>
        <button type="button" aria-label="閉じる" onClick={onClose} className="h-[34px] w-[34px] flex-none rounded-md border border-[#E5E7EB] text-[#374151]">
          ✕
        </button>
      </header>
      <DetailContent item={item} members={members} onSubmitUpdate={onSubmitUpdate} editing={editing} onEndEdit={() => setEditing(false)} />
      {!editing && (
        <footer className="flex items-center gap-2 border-t border-[#F1F3F5] px-4 py-3.5">
          {onSubmitUpdate && (
            <button type="button" onClick={() => setEditing(true)} className={`${PRIMARY_BUTTON} h-[34px]`}>
              進捗を更新
            </button>
          )}
          <SheetLink sourceUrl={sourceUrl} className={`${SECONDARY_BUTTON} h-[34px]`} />
          {!onSubmitUpdate && <span className="text-[11px] text-[#6B7280]">アプリでは閲覧のみです</span>}
        </footer>
      )}
    </aside>
  );
}
