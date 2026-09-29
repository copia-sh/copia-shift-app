import type { ReactNode } from "react";
import type { Member } from "../../types";
import type { BoardRoutine, BoardTask } from "../../taskBoard";
import { AssigneeList, PriorityText, StatusBadge, UnassignedCountBadge } from "./TaskBadges";

export type KeyedTask = BoardTask & { key: string };
export type KeyedRoutine = BoardRoutine & { key: string };

export interface EmptyNotice {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface SectionProps<T> {
  items: readonly T[];
  members: readonly Member[];
  unassignedCount: number;
  empty: EmptyNotice;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

const ROUTINE_COLUMNS = "grid-cols-[160px_minmax(0,1fr)_220px_80px]";
const TASK_COLUMNS = "grid-cols-[32px_minmax(0,1fr)_160px_104px_52px_80px]";
const ROW =
  "grid w-full items-center gap-3 border-b border-[#F1F3F5] px-3.5 py-2 text-left min-h-[44px] last:border-b-0 hover:bg-[#FBFCFD]";
const TITLE = "line-clamp-2 text-[13px] font-bold leading-[1.5] text-[#111827]";

function SectionHeading({ title, count, unassignedCount, aside }: {
  title: string; count: number; unassignedCount: number; aside?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <h2 className="text-[14px] font-bold text-[#111827]">{title}</h2>
      <span className="text-[12px] text-[#6B7280]">{count}件</span>
      <UnassignedCountBadge count={unassignedCount} />
      {aside && <span className="ml-auto hidden text-[12px] text-[#6B7280] md:inline">{aside}</span>}
    </div>
  );
}

function EmptyRow({ empty }: { empty: EmptyNotice }) {
  return (
    <p className="px-3.5 py-4 text-[13px] text-[#4B5563]">
      {empty.text}
      {empty.actionLabel && empty.onAction && (
        <button type="button" onClick={empty.onAction} className="ml-3 text-[#248DD4] underline">
          {empty.actionLabel}
        </button>
      )}
    </p>
  );
}

function TableCard({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-[#E5E7EB] bg-white md:block">
      {header}
      {children}
    </div>
  );
}

function HeaderRow({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div
      aria-hidden
      className={`grid ${columns} gap-3 border-b border-[#E5E7EB] bg-[#FBFCFD] px-3.5 py-1.5 text-[11px] font-bold text-[#6B7280]`}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function MobileCard({ selected, onClick, meta, title, footer }: {
  selected: boolean; onClick: () => void; meta: ReactNode; title: string; footer: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={selected}
      onClick={onClick}
      className={`flex w-full flex-col gap-1 rounded-xl border bg-white px-3 py-2.5 text-left ${
        selected ? "border-[#248DD4] shadow-[0_2px_4px_rgba(36,141,212,0.2)]" : "border-[#E5E7EB]"
      }`}
    >
      <span className="text-[11px] text-[#4B5563]">{meta}</span>
      <span className={TITLE}>{title}</span>
      <span className="flex items-center justify-between gap-2">{footer}</span>
    </button>
  );
}

function MobileEmpty({ empty }: { empty: EmptyNotice }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white md:hidden">
      <EmptyRow empty={empty} />
    </div>
  );
}

export function RoutineSection({ items, members, unassignedCount, empty, selectedKey, onSelect }: SectionProps<KeyedRoutine>) {
  return (
    <section aria-label="定例業務">
      <SectionHeading title="定例業務" count={items.length} unassignedCount={unassignedCount} />
      <TableCard header={<HeaderRow columns={ROUTINE_COLUMNS} labels={["頻度", "内容", "担当", "ステータス"]} />}>
        {items.length === 0 && <EmptyRow empty={empty} />}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-expanded={selectedKey === item.key}
            onClick={() => onSelect(item.key)}
            className={`${ROW} ${ROUTINE_COLUMNS} ${selectedKey === item.key ? "bg-[#EDF6FD] hover:bg-[#EDF6FD]" : ""}`}
          >
            <span className="text-[12px] text-[#374151]">{item.frequency}</span>
            <span className={TITLE}>{item.title}</span>
            <AssigneeList assignees={item.assignees} members={members} />
            <span><StatusBadge status={item.status} /></span>
          </button>
        ))}
      </TableCard>
      <div className="flex flex-col gap-1.5 md:hidden">
        {items.length === 0 && <MobileEmpty empty={empty} />}
        {items.map((item) => (
          <MobileCard
            key={item.key}
            selected={selectedKey === item.key}
            onClick={() => onSelect(item.key)}
            meta={item.frequency}
            title={item.title}
            footer={<>
              <AssigneeList assignees={item.assignees} members={members} size={18} />
              <StatusBadge status={item.status} />
            </>}
          />
        ))}
      </div>
    </section>
  );
}

export function TaskSection({ items, members, unassignedCount, empty, selectedKey, onSelect }: SectionProps<KeyedTask>) {
  return (
    <section aria-label="タスク">
      <SectionHeading title="タスク" count={items.length} unassignedCount={unassignedCount} aside="シートの順（No順）" />
      <TableCard
        header={<HeaderRow columns={TASK_COLUMNS} labels={["No", "内容", "担当", "期限目安", "優先度", "ステータス"]} />}
      >
        {items.length === 0 && <EmptyRow empty={empty} />}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-expanded={selectedKey === item.key}
            onClick={() => onSelect(item.key)}
            className={`${ROW} ${TASK_COLUMNS} ${selectedKey === item.key ? "bg-[#EDF6FD] hover:bg-[#EDF6FD]" : ""}`}
          >
            <span className="text-[12px] font-bold text-[#6B7280]">{item.no}</span>
            <span className={TITLE}>{item.title}</span>
            <AssigneeList assignees={item.assignees} members={members} />
            <span className="text-[12px] text-[#374151]">{item.due || "—"}</span>
            <PriorityText priority={item.priority} />
            <span><StatusBadge status={item.status} /></span>
          </button>
        ))}
      </TableCard>
      <div className="flex flex-col gap-1.5 md:hidden">
        {items.length === 0 && <MobileEmpty empty={empty} />}
        {items.map((item) => (
          <MobileCard
            key={item.key}
            selected={selectedKey === item.key}
            onClick={() => onSelect(item.key)}
            meta={[`No.${item.no}`, item.due && `期限 ${item.due}`, item.priority && `優先度 ${item.priority}`]
              .filter(Boolean)
              .join("　")}
            title={item.title}
            footer={<>
              <AssigneeList assignees={item.assignees} members={members} size={18} />
              <StatusBadge status={item.status} />
            </>}
          />
        ))}
      </div>
    </section>
  );
}
