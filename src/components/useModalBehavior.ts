import { useEffect, useRef } from "react";

/**
 * 開いているモーダルの重なり順。ダイアログの上にシートを重ねたとき、
 * Escape で下のものまで閉じないようにする（document へ付けた listener は
 * stopPropagation では止まらないので、自分が最前面かを見て判断する）。
 */
const modalStack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalBehaviorOptions {
  onClose: () => void;
  /** 未保存の入力があるか。true なら Escape・背景で即閉じない */
  dirty?: boolean;
  /** 閉じてよいか確認する。false を返すと閉じない */
  confirmClose?: () => boolean;
}

/**
 * ダイアログ・シート共通の挙動。
 *
 * - 開いたら中の主ボタン（無ければ最初の操作可能な要素）へフォーカスを移す
 * - Tab はこの中だけを循環する。背後の画面へ抜けると、どこを操作しているか分からなくなる
 * - Escape で閉じる。未保存の入力があるときは確認を挟む
 * - 閉じたら、開く前にフォーカスしていた要素へ戻す（キーボードで元の位置を失わない）
 */
export function useModalBehavior<T extends HTMLElement>({
  onClose,
  dirty = false,
  confirmClose,
}: ModalBehaviorOptions) {
  const containerRef = useRef<T>(null);
  // 毎レンダーで作り直される関数を effect の依存に入れると、開き直しのたびに
  // フォーカスが奪われる。最新の値は effect で ref に移す（レンダー中は触らない）。
  const handlers = useRef({ onClose, dirty, confirmClose });
  useEffect(() => {
    handlers.current = { onClose, dirty, confirmClose };
  });

  useEffect(() => {
    const token = Symbol("modal");
    modalStack.push(token);
    const isTopmost = () => modalStack[modalStack.length - 1] === token;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    const focusables = () =>
      container ? [...container.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];

    const initial =
      container?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? null;
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const requestClose = () => {
      const { onClose: close, dirty: isDirty, confirmClose: confirm } = handlers.current;
      if (isDirty && confirm && !confirm()) return;
      close();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = modalStack.indexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      previouslyFocused?.focus?.();
    };
  }, []);

  const requestClose = () => {
    const { onClose: close, dirty: isDirty, confirmClose: confirm } = handlers.current;
    if (isDirty && confirm && !confirm()) return;
    close();
  };

  return { containerRef, requestClose };
}
