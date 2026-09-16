import { useId, type ReactNode } from "react";
import { useModalBehavior } from "./useModalBehavior";
import { dialogButtonClass } from "./dialogStyles";

export interface DialogAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** 取り消せない操作はコーラルにする */
  tone?: "primary" | "danger";
}

export interface DialogProps {
  /** 何が起きるかを動詞で書く（「5枠を確定しますか？」） */
  title: string;
  /** 対象（氏名・日付・枠数）を必ず含める */
  description?: ReactNode;
  children?: ReactNode;
  /** 失敗の理由。ダイアログの外には出さない（裏に隠れて読めなくなる） */
  error?: string | null;
  dirty?: boolean;
  confirmClose?: () => boolean;
  primary?: DialogAction;
  secondary?: DialogAction;
  onClose: () => void;
  /** 既定は 448px（既存のダイアログと同じ幅） */
  width?: number;
}

/**
 * ダイアログの型。タイトル・本文・エラー・ボタンの位置と、フォーカスの扱いを
 * 1か所で決める。個別の画面がそれぞれの流儀で組むと、閉じ方も読み上げも揃わない。
 */
export function Dialog({
  title,
  description,
  children,
  error = null,
  dirty = false,
  confirmClose,
  primary,
  secondary,
  onClose,
  width = 448,
}: DialogProps) {
  const titleId = useId();
  const { containerRef, requestClose } = useModalBehavior<HTMLDivElement>({
    onClose,
    dirty,
    confirmClose,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full flex-col rounded-xl bg-white p-5 shadow-xl"
        style={{ maxWidth: width }}
      >
        <h2 id={titleId} className="text-[20px] font-bold leading-snug text-[#111827]">
          {title}
        </h2>

        {description && (
          <div className="mt-2 text-[15px] leading-[1.6] text-[#374151]">{description}</div>
        )}

        {children && <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>}

        {error && (
          <p
            aria-live="polite"
            className="mt-4 rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-3 py-2 text-[13px] font-bold text-[#D9736F]"
          >
            {error}
          </p>
        )}

        {(primary || secondary) && (
          <div className="mt-5 flex gap-2">
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                disabled={secondary.disabled}
                className={dialogButtonClass("secondary")}
              >
                {secondary.label}
              </button>
            )}
            {primary && (
              <button
                type="button"
                data-autofocus
                onClick={primary.onClick}
                disabled={primary.disabled}
                className={dialogButtonClass(primary.tone === "danger" ? "danger" : "primary")}
              >
                {primary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
