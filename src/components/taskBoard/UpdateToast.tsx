import { useEffect } from "react";

export interface ToastState {
  message: string;
  /** 押すと変更前に戻す。無ければボタンを出さない */
  onUndo?: () => void;
  busy?: boolean;
}

const VISIBLE_MS = 6000;

/**
 * 反映の知らせ。完了にしたタスクは一覧から消えるので、何をしたかをここで伝え、ステータスは元に戻せるようにする。
 * スマホは固定フッターの上、PC は右下に出す。
 */
export function UpdateToast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast || toast.busy) return;
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(var(--screen-footer-h)+8px)] z-[45] flex items-center gap-3 rounded-lg bg-[#111827] px-3.5 py-2.5 text-white shadow-[0_4px_12px_rgba(17,24,39,0.25)] md:inset-x-auto md:bottom-6 md:right-6 md:max-w-[420px]"
    >
      <span className="min-w-0 flex-1 text-[13px] font-bold leading-[1.5]">{toast.message}</span>
      {toast.onUndo && (
        <button type="button" onClick={toast.onUndo} disabled={toast.busy} className="flex-none text-[13px] font-bold text-[#8CC8F0] underline disabled:opacity-60">
          {toast.busy ? "戻しています…" : "元に戻す"}
        </button>
      )}
      <button type="button" aria-label="閉じる" onClick={onDismiss} className="flex-none text-[14px] text-[#C8CDD2]">✕</button>
    </div>
  );
}
