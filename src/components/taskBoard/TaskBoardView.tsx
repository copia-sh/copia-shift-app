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
// シフト画面の絞り込み（MemberFilter）と同じ型のボタン
const CHIP =
  "flex-none whitespace-nowrap rounded-full border px-3 text-[12px] font-bold min-h-[44px] flex items-center md:h-[34px] md:min-h-0 md:rounded-md md:px-3";
const CHIP_ON = "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]";
const CHIP_OFF = "border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50";

/** シフト画面の「今月」ボタンと同じ型。 */
function SheetButton({ url }: { url: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-[34px] items-center rounded-md border border-gray-200 bg-white px-3 text-[12px] font-bold text-gray-700 shadow-[0_2px_0_0_#E3E3E3] hover:bg-[#F0F0F0] md:px-3.5 md:text-[13px]"
    >
      シートで編集 ↗
    </a>
  );
}

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
  if (!stale) return <span className="whitespace-nowrap text-[12px] text-gray-400">最終同期 {time}</span>;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-bold text-[#8A5310]">
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
      {/* 上部はシフト画面（App.tsx）と同じ並び・余白にする。画面を行き来しても位置が動かないように。 */}
      <div className="hidden flex-wrap items-center justify-end gap-2 px-5 pt-3.5 md:flex">
        <button type="button" onClick={props.onExport} className={HEADER_BTN}>書き出し</button>
        {props.adminMenuItems.length > 0 && <HeaderMenu label="管理" items={props.adminMenuItems} />}
        <HeaderMenu label={currentMember.displayName} items={props.accountMenuItems} />
      </div>
      <div className="standalone-mobile-header flex items-center justify-end gap-2 px-3 pt-2 md:hidden">
        <HeaderMenu label="メニュー" items={[...props.adminMenuItems, ...props.accountMenuItems]} />
      </div>

      <div className="flex min-h-[46px] flex-wrap items-center gap-2 px-3 pb-1.5 pt-2 md:gap-2.5 md:px-5 md:pt-2.5">
        <GroupSwitcher groups={props.groups} currentGroupId={groupId} onChange={props.onChangeGroup} onCreateNew={props.onCreateNewGroup} />
        <ScreenSwitcher screen="tasks" onChange={onChangeScreen} />
        {board && (
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <SyncInfo board={board} now={now} />
            <SheetButton url={board.sourceUrl} />
          </div>
        )}
      </div>

      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-3 pb-2 md:px-5 md:pb-3">
        <span className="mr-1 flex-none whitespace-nowrap text-[12px] font-bold text-[#6B7280]">表示する担当</span>
        {SCOPES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={scope === id}
            onClick={() => setScope(id)}
            className={`${CHIP} ${scope === id ? CHIP_ON : CHIP_OFF}`}
          >
            {label}
          </button>
        ))}
        <StatusFilter options={statusOptions} selected={statuses} onChange={setStatuses} />
        {board && (
          <div className="flex w-full items-center justify-between gap-3 md:hidden">
            <SyncInfo board={board} now={now} />
            <SheetButton url={board.sourceUrl} />
          </div>
        )}
      </div>
      {board && isStale(board.syncedAt, now) && <StaleSyncBanner />}

      <main className="mx-auto max-w-[1400px] px-2 pt-1 md:px-5">
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
