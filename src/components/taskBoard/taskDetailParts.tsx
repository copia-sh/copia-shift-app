import type { ReactNode } from "react";
import type { Member } from "../../types";
import { parseDeliverables, splitMemo, splitMemoAuthor } from "../../taskBoard";
import type { SubmitTaskUpdate } from "../../taskUpdateApi";
import { AssigneeList, PriorityText, StatusBadge } from "./TaskBadges";
import type { KeyedRoutine, KeyedTask } from "./TaskBoardSections";
import { TaskProgressForm } from "./TaskProgressForm";
import { LABEL } from "./taskDetailStyles";
import { DETAIL_SECTION } from "./controls";

export type DetailItem = ({ kind: "task" } & KeyedTask) | ({ kind: "routine" } & KeyedRoutine);

export interface DetailProps {
  item: DetailItem;
  members: readonly Member[];
  sourceUrl: string;
  onClose: () => void;
  /** 渡されたときだけ「進捗を更新」を出す（Worker の設定が無い環境では閲覧のみ） */
  onSubmitUpdate?: SubmitTaskUpdate;
}

const NOT_FILLED = <span className="text-[13px] text-ink-5">未記入</span>;

/** 「2026-09-20」→「9/20」 */
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className={`${LABEL} pt-0.5`}>{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </>
  );
}

function text(value: string): ReactNode {
  return value ? value : NOT_FILLED;
}

/** 状況メモ。日付ごとに分け、アプリから追記したもの（末尾が「（表示名）」）は書き手を小さく添える。 */
function Memo({ memo, memberNames }: { memo: string; memberNames: readonly string[] }) {
  const entries = splitMemo(memo);
  if (entries.length === 0) return NOT_FILLED;
  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((entry, index) => {
        const { text: body, author } = splitMemoAuthor(entry.text, memberNames);
        return (
          <li key={index} className="flex flex-col gap-0.5 md:grid md:grid-cols-[44px_1fr] md:gap-2">
            <span className="text-[11px] font-bold leading-[1.7] text-ink-3">{entry.date ? shortDate(entry.date) : ""}</span>
            <span className="text-[13px] leading-[1.7] text-ink">
              {body}
              {author && (
                <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-line-4 px-1.5 align-middle text-[10px] font-bold text-ink-3">
                  {author}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Deliverables({ value }: { value: string }) {
  const links = parseDeliverables(value);
  if (links.length === 0) return NOT_FILLED;
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link, index) => (
        <li key={index} className="rounded-md border border-line-2 px-3 py-2">
          {link.url ? (
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="break-all text-[13px] font-bold text-brand underline">
              {link.label} ↗
            </a>
          ) : (
            <span className="text-[13px] font-bold text-ink">{link.label}</span>
          )}
          {link.host && <span className="mt-0.5 block text-[11px] text-ink-4">{link.host}</span>}
        </li>
      ))}
    </ul>
  );
}

function DetailRead({ item, members }: Pick<DetailProps, "item" | "members">) {
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
      <hr className="border-line-3" />
      <section className={DETAIL_SECTION}>
        <h3 className={LABEL}>背景・目的</h3>
        {item.purpose ? <p className="text-[13px] leading-[1.7]">{item.purpose}</p> : NOT_FILLED}
      </section>
      <section className={DETAIL_SECTION}>
        <h3 className={LABEL}>状況メモ</h3>
        <Memo memo={item.memo} memberNames={members.map((member) => member.displayName)} />
      </section>
      <section className={DETAIL_SECTION}>
        <h3 className={LABEL}>最新の成果物</h3>
        <Deliverables value={item.deliverable} />
      </section>
    </div>
  );
}

/** 本文。「見る」と「変える」を分け、編集は「進捗を更新」を押してから始める。 */
export function DetailContent({ item, members, onSubmitUpdate, editing, onEndEdit }: Pick<DetailProps, "item" | "members" | "onSubmitUpdate"> & {
  editing: boolean;
  onEndEdit: () => void;
}) {
  if (!editing || !onSubmitUpdate) return <DetailRead item={item} members={members} />;
  return (
    <div className="px-4 py-3">
      <TaskProgressForm
        target={{ kind: item.kind, no: item.kind === "task" ? item.no : "", title: item.title, status: item.status }}
        onSubmit={onSubmitUpdate}
        onCancel={onEndEdit}
        onDone={onEndEdit}
      />
    </div>
  );
}

export function SheetLink({ sourceUrl, className }: { sourceUrl: string; className: string }) {
  if (!sourceUrl) return null;
  return (
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={className}>
      シートで編集 ↗
    </a>
  );
}
