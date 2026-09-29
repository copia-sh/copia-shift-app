import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { dragOffset, settleSheetDrag } from "./sheetDrag";
import type { SubmitTaskUpdate } from "../../taskUpdateApi";
import { TaskProgressForm } from "./TaskProgressForm";
import type { Member } from "../../types";
import { parseDeliverables, splitMemo } from "../../taskBoard";
import { AssigneeList, PriorityText, StatusBadge } from "./TaskBadges";
import type { KeyedRoutine, KeyedTask } from "./TaskBoardSections";

export type DetailItem = ({ kind: "task" } & KeyedTask) | ({ kind: "routine" } & KeyedRoutine);

interface DetailProps {
  item: DetailItem;
  members: readonly Member[];
  sourceUrl: string;
  onClose: () => void;
  /** 渡されたときだけ「進捗を更新」を出す（Worker の設定が無い環境では閲覧のみ） */
  onSubmitUpdate?: SubmitTaskUpdate;
}

const LABEL = "text-[11px] font-bold text-[#6B7280]";
const NOT_FILLED = <span className="text-[13px] text-[#9CA3AF]">未記入</span>;

function eyebrow(item: DetailItem): string {
  return item.kind === "task" ? `タスク No.${item.no}` : "定例業務";
}

/** 「2026-09-20」→「9/20」 */
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className={`${LABEL} pt-0.5`}>{label}</dt>
      <dd className="min-w-0 text-[13px] text-[#111827]">{children}</dd>
    </>
  );
}

function text(value: string): ReactNode {
  return value ? value : NOT_FILLED;
}

function Memo({ memo }: { memo: string }) {
  const entries = splitMemo(memo);
  if (entries.length === 0) return NOT_FILLED;
  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((entry, index) => (
        <li key={index} className="flex flex-col gap-0.5 md:grid md:grid-cols-[44px_1fr] md:gap-2">
          <span className="text-[11px] font-bold leading-[1.7] text-[#4B5563]">
            {entry.date ? shortDate(entry.date) : ""}
          </span>
          <span className="text-[13px] leading-[1.7] text-[#111827]">{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Deliverables({ value }: { value: string }) {
  const links = parseDeliverables(value);
  if (links.length === 0) return NOT_FILLED;
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link, index) => (
        <li key={index} className="rounded-md border border-[#EFF1F3] px-3 py-2">
          {link.url ? (
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="break-all text-[13px] font-bold text-[#248DD4] underline">
              {link.label} ↗
            </a>
          ) : (
            <span className="text-[13px] font-bold text-[#111827]">{link.label}</span>
          )}
          {link.host && <span className="mt-0.5 block text-[11px] text-[#6B7280]">{link.host}</span>}
        </li>
      ))}
    </ul>
  );
}

function DetailBody({ item, members, onSubmitUpdate }: Pick<DetailProps, "item" | "members" | "onSubmitUpdate">) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div><StatusBadge status={item.status} large /></div>
      <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-2">
        {item.kind === "routine" && <Field label="頻度">{text(item.frequency)}</Field>}
        <Field label="担当"><AssigneeList assignees={item.assignees} members={members} /></Field>
        {item.kind === "task" && (
          <>
            <Field label="期限目安">{text(item.due)}</Field>
            <Field label="優先度">{item.priority ? <PriorityText priority={item.priority} /> : NOT_FILLED}</Field>
            <Field label="フェーズ">{text(item.phase)}</Field>
          </>
        )}
      </dl>
      <hr className="border-[#F1F3F5]" />
      <section className="flex flex-col gap-1.5">
        <h3 className={LABEL}>背景・目的</h3>
        {item.purpose ? <p className="text-[13px] leading-[1.7]">{item.purpose}</p> : NOT_FILLED}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={LABEL}>状況メモ</h3>
        <Memo memo={item.memo} />
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={LABEL}>最新の成果物</h3>
        <Deliverables value={item.deliverable} />
      </section>
      {onSubmitUpdate && (
        // 別のタスクを開いたら入力を持ち越さない
        <TaskProgressForm
          key={item.key}
          target={{ kind: item.kind, no: item.kind === "task" ? item.no : "", title: item.title, status: item.status }}
          onSubmit={onSubmitUpdate}
        />
      )}
    </div>
  );
}

function SheetLink({ sourceUrl, className }: { sourceUrl: string; className: string }) {
  if (!sourceUrl) return null;
  return (
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={className}>
      シートで編集 ↗
    </a>
  );
}

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-md border border-[#E5E7EB] bg-white px-3 text-[13px] font-bold text-[#374151] shadow-[0_2px_0_0_#E3E3E3]";

/** PC の右パネル。シフト画面の詳細パネルと同じ位置・型。 */
export function TaskDetailPanel({ item, members, sourceUrl, onClose, onSubmitUpdate }: DetailProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      aria-label={`${eyebrow(item)}の詳細`}
      className="sticky top-4 w-[340px] flex-none self-start overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
    >
      <header className="flex items-start gap-3 border-b border-[#F1F3F5] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className={LABEL}>{eyebrow(item)}</p>
          <h2 className="mt-0.5 text-[14px] font-bold leading-[1.5] text-[#111827]">{item.title}</h2>
        </div>
        <button type="button" aria-label="閉じる" onClick={onClose} className="h-[34px] w-[34px] flex-none rounded-md border border-[#E5E7EB] text-[#374151]">
          ✕
        </button>
      </header>
      <DetailBody item={item} members={members} onSubmitUpdate={onSubmitUpdate} />
      <footer className="flex items-center gap-3 border-t border-[#F1F3F5] px-4 py-3.5">
        <SheetLink sourceUrl={sourceUrl} className={`${SECONDARY_BUTTON} h-[34px]`} />
        <span className="text-[11px] text-[#6B7280]">{onSubmitUpdate ? "ほかの項目はシートで編集します" : "アプリでは閲覧のみです"}</span>
      </footer>
    </aside>
  );
}

/** スマホの下からのシート。フッターごと幕で覆い、閉じるまで画面は切り替えられない。 */
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
  const { expanded, sheetStyle, handleProps } = useSheetDrag(onClose);

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
            <span className="h-1 w-10 rounded-full bg-[#C8CDD2]" />
          </div>
          <header className="flex items-start gap-3 border-b border-[#F1F3F5] px-4 pb-3 pt-1">
            <div className="min-w-0 flex-1">
              <p className={LABEL}>{eyebrow(item)}</p>
              <h2 className="mt-0.5 text-[14px] font-bold leading-[1.5] text-[#111827]">{item.title}</h2>
              <p className="sr-only">{expanded ? "下へ引くと元の高さに戻ります" : "上へ引くと広がり、下へ引くと閉じます"}</p>
            </div>
            <button ref={closeRef} type="button" aria-label="閉じる" onClick={onClose} className="h-11 w-11 flex-none rounded-md border border-[#E5E7EB] text-[#374151]">
              ✕
            </button>
          </header>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <DetailBody item={item} members={members} onSubmitUpdate={onSubmitUpdate} />
        </div>
        <footer className="flex-none border-t border-[#F1F3F5] px-4 pt-3" style={{ paddingBottom: "var(--screen-footer-pad)" }}>
          <SheetLink sourceUrl={sourceUrl} className={`${SECONDARY_BUTTON} h-11 w-full`} />
        </footer>
      </div>
    </div>
  );
}
