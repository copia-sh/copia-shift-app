import { useEffect, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent } from "react";
import { dragOffset, settleSheetDrag } from "./sheetDrag";
import { DetailContent, SheetLink, type DetailProps } from "./taskDetailParts";
import { eyebrow, LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./taskDetailStyles";

/** シートを指で動かす。つまみと見出しを掴んで、下へ引くと閉じ、上へ引くと画面いっぱいに広がる。 */
function useSheetDrag(onClose: () => void) {
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 閉じるボタンの操作は奪わない
    if ((event.target as HTMLElement).closest("button")) return;
    startY.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    setOffset(dragOffset(event.clientY - startY.current));
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const result = settleSheetDrag(event.clientY - startY.current, expanded);
    startY.current = null;
    setDragging(false);
    setOffset(0);
    if (result === "close") onClose();
    else if (result === "expand") setExpanded(true);
    else if (result === "collapse") setExpanded(false);
  };

  return {
    expanded,
    setExpanded,
    sheetStyle: {
      maxHeight: expanded ? "calc(100% - 24px)" : "86%",
      transform: `translateY(${offset}px)`,
      transition: dragging ? "none" : "transform 180ms ease, max-height 180ms ease",
    } as React.CSSProperties,
    handleProps: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}

/** スマホの下からのシート。フッターごと幕で覆い、閉じるまで画面は切り替えられない。 */
export function TaskDetailSheet({ item, members, sourceUrl, onClose, onSubmitUpdate }: DetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const { expanded, setExpanded, sheetStyle, handleProps } = useSheetDrag(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  // 入力欄を触ったら、キーボードで隠れないようシートを広げて、その欄が見える位置まで送る
  const onFocusField = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches("input, textarea, select")) return;
    setExpanded(true);
    window.setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[rgba(17,24,39,0.45)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${eyebrow(item)}の詳細`}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full flex-col rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(57,57,57,0.2)]"
        style={sheetStyle}
      >
        <div {...handleProps} className="flex-none cursor-grab touch-none select-none active:cursor-grabbing">
          <div aria-hidden className="flex justify-center pb-1 pt-2">
            <span className="h-1 w-10 rounded-full bg-ink-none" />
          </div>
          <header className="flex items-start gap-3 border-b border-line-3 px-4 pb-3 pt-1">
            <div className="min-w-0 flex-1">
              <p className={LABEL}>{editing ? `${eyebrow(item)}の進捗を更新` : eyebrow(item)}</p>
              <h2 className="mt-0.5 text-[14px] font-bold leading-[1.5] text-ink">{item.title}</h2>
              <p className="sr-only">{expanded ? "下へ引くと元の高さに戻ります" : "上へ引くと広がり、下へ引くと閉じます"}</p>
            </div>
            <button ref={closeRef} type="button" aria-label="閉じる" onClick={onClose} className="h-11 w-11 flex-none rounded-md border border-line text-ink-2">
              ✕
            </button>
          </header>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onFocus={onFocusField}>
          <DetailContent item={item} members={members} onSubmitUpdate={onSubmitUpdate} editing={editing} onEndEdit={() => setEditing(false)} />
        </div>
        {!editing && (
          <footer className="flex flex-none flex-col gap-2 border-t border-line-3 px-4 pt-3" style={{ paddingBottom: "var(--screen-footer-pad)" }}>
            {onSubmitUpdate && (
              <button type="button" onClick={() => setEditing(true)} className={`${PRIMARY_BUTTON} h-11 w-full`}>
                進捗を更新
              </button>
            )}
            <SheetLink sourceUrl={sourceUrl} className={`${SECONDARY_BUTTON} h-11 w-full`} />
          </footer>
        )}
      </div>
    </div>
  );
}
