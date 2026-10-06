import type { ReactNode } from "react";

const PRIMARY =
  "inline-flex h-11 items-center justify-center rounded-md bg-brand px-4 text-[14px] font-bold text-white shadow-[0_2px_0_0_var(--color-brand-deep)] md:h-[38px]";
const SECONDARY =
  "inline-flex h-11 items-center justify-center rounded-md border border-line bg-white px-4 text-[14px] font-bold text-ink-2 shadow-[0_2px_0_0_var(--color-edge)] md:h-[38px]";

function StateCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto mt-6 flex max-w-[560px] flex-col items-center gap-3 rounded-xl border border-line bg-white px-5 py-8 text-center">
      {children}
    </div>
  );
}

export function TaskBoardLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-4">タスクを読み込んでいます…</p>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4 rounded-xl border border-line bg-white px-4 py-4">
          <span className="h-4 flex-1 rounded bg-line-3" />
          <span className="h-6 w-16 rounded-full bg-line-3" />
        </div>
      ))}
    </div>
  );
}

/** ドキュメントが無い＝シートのURLもまだ分からないので、シートへのリンクは出せない。 */
export function TaskBoardMissing() {
  return (
    <StateCard>
      <p className="text-[16px] font-bold text-ink">まだ同期されていません</p>
      <p className="text-[14px] leading-relaxed text-ink-3">
        タスク表（スプレッドシート）は15分ごとに取り込みます。初回の取り込みが終わると、ここに表示されます。
      </p>
    </StateCard>
  );
}

export function TaskBoardDenied({ onBack }: { onBack: () => void }) {
  return (
    <StateCard>
      <span className="inline-flex h-6 items-center rounded-full border border-today bg-today-wash px-2.5 text-[12px] font-bold text-orange-deep">
        権限
      </span>
      <p className="text-[16px] font-bold text-ink">タスクを表示できません</p>
      <p className="text-[14px] leading-relaxed text-ink-3">
        このグループのメンバーとして読み取る権限がありません。担当社員（赤間）に確認してください。
      </p>
      <button type="button" onClick={onBack} className={PRIMARY}>
        シフトへ戻る
      </button>
    </StateCard>
  );
}

export function TaskBoardError() {
  return (
    <StateCard>
      <p className="text-[16px] font-bold text-ink">タスクを読み込めませんでした</p>
      <p className="text-[14px] leading-relaxed text-ink-3">通信状況を確認して、ページを再読み込みしてください。</p>
    </StateCard>
  );
}

export function TaskBoardNoMatch({ description, onReset, onShowAll }: {
  description: string; onReset: () => void; onShowAll?: () => void;
}) {
  return (
    <StateCard>
      <p className="text-[16px] font-bold text-ink">条件に合うタスクがありません</p>
      <p className="text-[14px] leading-relaxed text-ink-3">{description}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onReset} className={PRIMARY}>条件を解除</button>
        {onShowAll && <button type="button" onClick={onShowAll} className={SECONDARY}>全員を見る</button>}
      </div>
    </StateCard>
  );
}

export function StaleSyncBanner() {
  return (
    <div className="mx-auto max-w-[1400px] px-3 pb-2 md:px-5">
      <div role="status" className="rounded-md border border-today bg-today-wash-2 px-3 py-2">
        <p className="text-[13px] font-bold text-ink">1時間以上、シートからの取り込みがありません</p>
        <p className="text-[12px] text-ink-3">同期が止まっている可能性があります。最新の内容はシートで確認してください。</p>
      </div>
    </div>
  );
}
