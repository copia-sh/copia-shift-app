import { useId, type ReactNode } from "react";
import { useModalBehavior } from "./useModalBehavior";
import { dialogButtonClass } from "./dialogStyles";
import type { DialogAction } from "./Dialog";

export interface SheetProps {
  title: string;
  /** 対象（日付・氏名）をタイトルの下に出す */
  subtitle?: ReactNode;
  children?: ReactNode;
  error?: string | null;
  dirty?: boolean;
  confirmClose?: () => boolean;
  primary?: DialogAction;
  secondary?: DialogAction;
  onClose: () => void;
}

/**
 * スマートフォン向けの下からせり上がるシート。
 * 最大高は画面の85%。下端は safe-area-inset-bottom を足して、ホームバーや
 * 固定バーで保存ボタンが隠れないようにする。
 */
export function Sheet({
  title,
  subtitle,
  children,
  error = null,
  dirty = false,
  confirmClose,
  primary,
  secondary,
  onClose,
}: SheetProps) {
  const titleId = useId();
  const { containerRef, requestClose } = useModalBehavior<HTMLDivElement>({
    onClose,
    dirty,
    confirmClose,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full flex-col rounded-t-xl bg-white shadow-[0_-2px_16px_0_rgba(17,24,39,0.18)]"
      >
        <div className="flex justify-center pb-1 pt-2">
          {/* 掴み棒。シートだと分かるようにする（操作はできない） */}
          <span className="h-1 w-11 rounded-full bg-[#E3E3E3]" aria-hidden />
        </div>

        <div className="px-4 pb-2">
          <h2 id={titleId} className="text-[18px] font-bold leading-snug text-[#111827]">
            {title}
          </h2>
          {subtitle && <div className="mt-1 text-[14px] text-[#4B5563]">{subtitle}</div>}
        </div>

        {children && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">{children}</div>}

        {error && (
          <p
            aria-live="polite"
            className="mx-4 mt-2 rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-3 py-2 text-[13px] font-bold text-[#D9736F]"
          >
            {error}
          </p>
        )}

        {(primary || secondary) && (
          <div
            className="flex gap-2 px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
          >
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                disabled={secondary.disabled}
                className={`${dialogButtonClass("secondary")} !h-[48px] text-[15px]`}
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
                className={`${dialogButtonClass(
                  primary.tone === "danger" ? "danger" : "primary",
                )} !h-[48px] text-[15px]`}
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
