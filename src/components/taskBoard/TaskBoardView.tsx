import { useCallback, useEffect, useMemo, useState } from "react";
import type { Group, Member } from "../../types";
import type { Screen } from "../../hooks/screen";
import {
  countStatuses,
  filterBoardItems,
  formatElapsed,
  formatSyncTime,
  isStale,
  isUnassigned,
  type TaskBoard,
  type TaskBoardState,
  type TaskScope,
} from "../../taskBoard";
import { useIsDesktop } from "../../hooks/useMediaQuery";
import { GroupSwitcher } from "../GroupSwitcher";
import { HeaderMenu, type HeaderMenuItem } from "../HeaderMenu";
import { ScreenSwitcher } from "../ScreenSwitcher";
import { StatusFilter } from "./StatusFilter";
import { RoutineSection, TaskSection, type KeyedRoutine, type KeyedTask } from "./TaskBoardSections";
import { TaskDetailPanel, TaskDetailSheet, type DetailItem } from "./TaskDetail";
import {
  StaleSyncBanner,
  TaskBoardDenied,
  TaskBoardError,
  TaskBoardLoading,
  TaskBoardMissing,
  TaskBoardNoMatch,
} from "./TaskBoardStates";

export interface TaskBoardViewProps {
  state: TaskBoardState;
  groupId: string;
  members: readonly Member[];
  currentMember: Member;
  groups: Group[];
  onChangeGroup: (id: string) => void;
  onCreateNewGroup: () => void;
  onChangeScreen: (next: Screen) => void;
  adminMenuItems: HeaderMenuItem[];
  accountMenuItems: HeaderMenuItem[];
  onExport: () => void;
  /** プレビュー用。指定すると現在時刻を固定する */
  fixedNow?: number;
  /** プレビュー用。最初に開いておく絞り込み・詳細 */
  initialScope?: TaskScope;
  initialSelectedKey?: string;
}

const HEADER_BTN = "rounded-md bg-transparent px-2.5 py-1.5 text-[13px] font-bold text-[#6B7280] hover:bg-white/70";
const SCOPES: readonly [TaskScope, string][] = [["mine", "自分"], ["all", "全員"]];

/** 同期が古いかの判定を、画面を開いたままでも進めるための現在時刻（1分ごと）。 */
function useNow(fixedNow?: number): number {
  const [now, setNow] = useState(() => fixedNow ?? Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [fixedNow]);
  return now;
}

function keyed(board: TaskBoard): { tasks: KeyedTask[]; routines: KeyedRoutine[] } {
  return {
    tasks: board.tasks.map((task, index) => ({ ...task, key: `task:${index}` })),
    routines: board.routines.map((routine, index) => ({ ...routine, key: `routine:${index}` })),
  };
}

function SyncInfo({ board, now }: { board: TaskBoard; now: number }) {
  const stale = isStale(board.syncedAt, now);
  const time = formatSyncTime(board.syncedAt);
  if (!stale) return <span className="text-[12px] text-[#6B7280] md:text-[13px]">最終同期 {time}</span>;
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#8A5310] md:text-[13px]">
      <span aria-hidden className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#F9E428] text-[11px] text-[#111827]">!</span>
      最終同期 {time}（{formatElapsed(board.syncedAt, now)}）
    </span>
  );
}

/** タスク画面の見た目。データの購読は `TaskBoardScreen` が行い、ここは受け取って描くだけ。 */
export function TaskBoardView(props: TaskBoardViewProps) {
  const { state, groupId, members, currentMember, onChangeScreen } = props;
  const now = useNow(props.fixedNow);
  const isDesktop = useIsDesktop();
  const [scope, setScope] = useState<TaskScope>(props.initialScope ?? "mine");
  const [statuses, setStatuses] = useState<ReadonlySet<string> | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(props.initialSelectedKey ?? null);
  const closeDetail = useCallback(() => setSelectedKey(null), []);

  const board = state.kind === "ready" ? state.board : null;
  const all = useMemo(() => (board ? keyed(board) : { tasks: [], routines: [] }), [board]);
  const filter = { scope, displayName: currentMember.displayName, statuses };
  const scopeOnly = { ...filter, statuses: null };
  const tasks = filterBoardItems(all.tasks, filter);
  const routines = filterBoardItems(all.routines, filter);
  const statusOptions = countStatuses([
    ...filterBoardItems(all.routines, scopeOnly),
    ...filterBoardItems(all.tasks, scopeOnly),
  ]);

  // 絞り込みで一覧から消えたものは、詳細も閉じた扱いにする。
  const selectedTask = tasks.find((task) => task.key === selectedKey);
  const selectedRoutine = routines.find((routine) => routine.key === selectedKey);
  const selected: DetailItem | null = selectedTask
    ? { kind: "task", ...selectedTask }
    : selectedRoutine
      ? { kind: "routine", ...selectedRoutine }
      : null;

  const showAll = () => setScope("all");
  const resetFilters = () => { setScope("all"); setStatuses(null); };
  const toggleSelect = (key: string) => setSelectedKey((current) => (current === key ? null : key));
  const unassigned = (items: readonly { assignees: readonly string[] }[]) =>
    scope === "all" ? items.filter((item) => isUnassigned(item.assignees)).length : 0;
  const sectionEmpty = (noun: string) =>
    statuses !== null
      ? { text: `条件に合う${noun}はありません` }
      : scope === "mine"
        ? { text: `自分が担当の${noun}はありません`, actionLabel: `全員の${noun}を見る`, onAction: showAll }
        : { text: `${noun}はありません` };
  const filterDescription = [scope === "mine" && "「自分」", statuses && `「ステータス：${[...statuses].join("・") || "なし"}」`]
    .filter(Boolean)
    .join("と");

  return (
    <div className="min-h-screen pb-[calc(90px+env(safe-area-inset-bottom))] md:pb-10" style={{ background: "var(--c-page)", color: "var(--c-ink)" }}>
      <header className="standalone-mobile-header flex items-center gap-2.5 border-b border-[#E5E7EB] bg-white px-3 pb-2.5 pt-1.5 md:px-4 md:py-2.5">
        <GroupSwitcher groups={props.groups} currentGroupId={groupId} onChange={props.onChangeGroup} onCreateNew={props.onCreateNewGroup} />
        <ScreenSwitcher screen="tasks" onChange={onChangeScreen} />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={props.onExport} className={`${HEADER_BTN} hidden md:inline-flex`}>書き出し</button>
          <span className="hidden md:inline-flex">
            {props.adminMenuItems.length > 0 && <HeaderMenu label="管理" items={props.adminMenuItems} />}
            <HeaderMenu label={currentMember.displayName} items={props.accountMenuItems} />
          </span>
          <span className="md:hidden">
            <HeaderMenu label="メニュー" items={[...props.adminMenuItems, ...props.accountMenuItems]} />
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-2 border-b border-[#E5E7EB] bg-[#FBFCFD] px-3 py-2.5 md:flex-row md:items-center md:px-4">
        <div className="flex items-center gap-2">
          <div role="group" aria-label="表示する担当" className="flex flex-1 overflow-hidden rounded-md border border-[#E5E7EB] md:flex-none">
            {SCOPES.map(([id, label], index) => (
              <button
                key={id}
                type="button"
                aria-pressed={scope === id}
                onClick={() => setScope(id)}
                className={`h-11 flex-1 px-4 text-[14px] md:h-[34px] ${index > 0 ? "border-l border-[#E5E7EB]" : ""} ${
                  scope === id ? "bg-[#D1E9F9] font-bold text-[#0863A0]" : "bg-white text-[#374151]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <StatusFilter options={statusOptions} selected={statuses} onChange={setStatuses} />
        </div>
        {board && (
          <div className="flex items-center justify-between gap-3 md:ml-auto">
            <SyncInfo board={board} now={now} />
            {board.sourceUrl && (
              <a
                href={board.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center text-[14px] font-bold text-[#248DD4] md:h-[34px] md:rounded-md md:border md:border-[#E5E7EB] md:bg-white md:px-3.5 md:text-[#374151] md:shadow-[0_2px_0_0_#E3E3E3]"
              >
                シートで編集 ↗
              </a>
            )}
          </div>
        )}
      </div>
      {board && isStale(board.syncedAt, now) && <StaleSyncBanner />}

      <main className="mx-auto max-w-[1400px] px-3 py-4 md:px-5 md:pb-7 md:pt-5">
        {state.kind === "loading" && <TaskBoardLoading />}
        {state.kind === "missing" && <TaskBoardMissing />}
        {state.kind === "denied" && <TaskBoardDenied onBack={() => onChangeScreen("shifts")} />}
        {state.kind === "error" && <TaskBoardError />}
        {board && tasks.length === 0 && routines.length === 0 && (scope === "mine" || statuses !== null) ? (
          <TaskBoardNoMatch
            description={`${filterDescription}で絞り込んでいます。条件をひとつ外すと表示される場合があります。`}
            onReset={resetFilters}
            onShowAll={scope === "mine" ? showAll : undefined}
          />
        ) : board && (
          <div className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-[22px] md:gap-7">
              <RoutineSection items={routines} members={members} unassignedCount={unassigned(routines)} empty={sectionEmpty("定例業務")} selectedKey={selectedKey} onSelect={toggleSelect} />
              <TaskSection items={tasks} members={members} unassignedCount={unassigned(tasks)} empty={sectionEmpty("タスク")} selectedKey={selectedKey} onSelect={toggleSelect} />
            </div>
            {selected && isDesktop && (
              <TaskDetailPanel item={selected} members={members} sourceUrl={board.sourceUrl} onClose={closeDetail} />
            )}
          </div>
        )}
      </main>
      {selected && board && !isDesktop && (
        <TaskDetailSheet item={selected} members={members} sourceUrl={board.sourceUrl} onClose={closeDetail} />
      )}
    </div>
  );
}
