import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useScreen } from "./hooks/useScreen";
import { ScreenFooter, ScreenSwitcher } from "./components/ScreenSwitcher";
// タスク画面はタブを切り替えたときに読み込む。初期表示には要らない。
const TaskBoardScreen = lazy(() =>
  import("./components/taskBoard/TaskBoardScreen").then((m) => ({ default: m.TaskBoardScreen })),
);
import { LoginGate } from "./components/LoginGate";
import { GroupGate, type ResolvedGroup } from "./app/GroupGate";
import { AppDialogs } from "./app/AppDialogs";
import { NO_DIALOG, type DialogState } from "./app/dialogState";
import { useShiftActions } from "./app/useShiftActions";
import {
  ShiftModeToggle,
  CalendarNav,
  ShiftLegend,
  ShiftListMatrix,
  ShiftMonthGrid,
  ShiftWeekView,
  BulkEditToolbar,
} from "./components/ShiftMatrixViews";
import {
  canTapCell,
  nextInCycle,
  parseSelKey,
  cellStatesOf,
  isSimpleCell,
  type BulkOp,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "./components/shiftVisual";
import { MemberFilter } from "./components/MemberFilter";
import { LoadingScreen } from "./components/FullScreenMessage";
import { HeaderMenu } from "./components/HeaderMenu";
import { useAuthUser } from "./hooks/useAuth";
import { useShiftsInRange } from "./hooks/useShifts";
import { useGroupSettings } from "./hooks/useGroupSettings";
import { useShiftTypes } from "./hooks/useShiftTypes";
import { signOut } from "./firebase/auth";
import { getMonthGridDays, nextMonth, previousMonth, toDateKey } from "./utils/date";
import { DEFAULT_GROUP_SETTINGS } from "./types";
import {
  emptyRosterReason,
  hasActiveFilter,
  nonTargetCount,
  rosterMembers,
  type RosterFilter,
} from "./components/memberRoster";
import { readRosterFilter, storeRosterFilter } from "./utils/rosterFilterStorage";
import { buildShiftTheme } from "./components/shiftTheme";

type ViewMode = "list" | "month" | "week";

const HEADER_BTN =
  "rounded-md bg-transparent px-2.5 py-1.5 text-[13px] font-bold text-ink-4 hover:bg-white/70";

/** 空表示の中に置くボタン。条件の解除や再読み込みなど、その場でやり直すためのもの。 */
const RETRY_BTN =
  "mt-4 h-[38px] rounded-md border border-line bg-white px-4 text-[13px] font-bold text-ink-2 shadow-[0_2px_0_0_var(--color-edge)] active:translate-y-0.5 active:shadow-none";

function App() {
  const user = useAuthUser();

  return (
    <LoginGate user={user}>
      {(currentUser) => (
        <GroupGate user={currentUser}>
          {(resolved) => <ShiftCalendar key={resolved.groupId} uid={currentUser.uid} {...resolved} />}
        </GroupGate>
      )}
    </LoginGate>
  );
}

function ShiftCalendar({
  uid,
  currentMember,
  members,
  groupId,
  groups,
  onChangeGroup,
  onCreateNewGroup,
}: ResolvedGroup & { uid: string }) {
  const [view, setView] = useState<ViewMode>("list");
  const [screen, setScreen] = useScreen();
  const [mode, setMode] = useState<ShiftMode>("single");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selected, setSelected] = useState<Set<SelKey>>(new Set());
  // 絞り込みは1つの値としてまとめて持つ。条件がばらばらの state に散ると、
  // 保存・復元・解除のたびに一部だけ取り残される。
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>(() => readRosterFilter(groupId));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(NO_DIALOG);
  const settings = useGroupSettings(groupId);
  const shiftTypes = useShiftTypes(groupId);

  const theme = useMemo(() => (shiftTypes ? buildShiftTheme(shiftTypes) : null), [shiftTypes]);

  const { startKey, endKey } = useMemo(() => {
    const days = getMonthGridDays(anchorDate, settings?.weekStartsOn ?? 0);
    return { startKey: toDateKey(days[0]), endKey: toDateKey(days[days.length - 1]) };
  }, [anchorDate, settings?.weekStartsOn]);

  const { shifts, error: shiftsError } = useShiftsInRange(groupId, startKey, endKey);
  const actions = useShiftActions({ groupId, uid, currentMember, shifts, theme });

  const canConfirm = currentMember.role === "admin" || currentMember.role === "leader";
  const openDialog = (patch: Partial<DialogState>) => setDialog((d) => ({ ...d, ...patch }));

  function changeMode(m: ShiftMode) {
    if (m === "review" && !canConfirm) return;
    setMode(m);
    setSelected(new Set());
  }

  function toggleMany(keys: SelKey[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  async function handleBulk(op: BulkOp) {
    await actions.applyOps([...selected].map(actions.targetOf), op);
    if (op.kind === "desired") return;
    setSelected(new Set());
  }

  async function onCellTap(k: SelKey, st: CellState) {
    const { memberId } = parseSelKey(k);
    if (!canTapCell(mode, memberId, currentMember.id, st)) return;

    if (mode === "single") {
      setSelected(new Set([k]));
      const target = actions.targetOf(k);
      const cellStates = cellStatesOf(target.shifts, theme?.unavailableKeys ?? new Set());
      if (isSimpleCell(cellStates)) {
        const op = nextInCycle(st, theme?.cycleKeys ?? []);
        if (op) await actions.applyOps([target], op);
      }
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const inviteUrl = `${window.location.origin}${window.location.pathname}?g=${groupId}`;

  async function handleCopyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy invite link:", err);
    }
  }

  const activeMembers = useMemo(() => (members ?? []).filter((m) => m.active), [members]);

  // 保存済みの条件に、今は存在しない属性が残っていることがある（属性の削除・改名）。
  // そのまま使うと0件になるので、実在する属性だけに落とす。
  const effectiveFilter = useMemo<RosterFilter>(() => {
    const available = new Set(activeMembers.flatMap((member) => member.attributes));
    return {
      ...rosterFilter,
      attributes: new Set([...rosterFilter.attributes].filter((a) => available.has(a))),
    };
  }, [activeMembers, rosterFilter]);

  const filteredMembers = useMemo(
    () => rosterMembers(activeMembers, currentMember.id, effectiveFilter),
    [activeMembers, currentMember.id, effectiveFilter],
  );
  const nonTargets = useMemo(() => nonTargetCount(activeMembers), [activeMembers]);
  const emptyReason = useMemo(
    () => emptyRosterReason(activeMembers, currentMember.id, effectiveFilter),
    [activeMembers, currentMember.id, effectiveFilter],
  );

  useEffect(() => {
    storeRosterFilter(groupId, rosterFilter);
  }, [groupId, rosterFilter]);

  /** 絞り込みを変えたら選択は捨てる。画面から消えたセルを操作対象に残さない。 */
  function updateFilter(patch: Partial<RosterFilter>) {
    setRosterFilter((current) => ({ ...current, ...patch }));
    setSelected(new Set());
  }
  const resetFilters = () =>
    updateFilter({ showCurrentMemberOnly: false, attributes: new Set(), nameQuery: "" });

  // メニューの中身は1か所で組み立てる。PCとスマホで内容がずれないようにする。
  // 「管理」に入るのは権限のある項目だけで、無い人にはメニュー自体を出さない。
  const adminMenuItems =
    currentMember.role === "admin"
      ? [
          { key: "settings", label: "グループ設定", onSelect: () => openDialog({ settings: true }) },
          { key: "members", label: "メンバー管理", onSelect: () => openDialog({ memberAdmin: true }) },
        ]
      : [];

  const accountMenuItems = [
    { key: "profile", label: "表示名の変更", onSelect: () => openDialog({ profile: true }) },
    { key: "signout", label: "ログアウト", onSelect: () => signOut() },
  ];

  const common = {
    anchorDate,
    members: filteredMembers,
    shifts: shifts ?? [],
    currentMemberId: currentMember.id,
    mode,
    selected,
    // 未取得のうちは既定値で描く。ここで `settings!` と断言してしまうと、
    // 後で描画の分岐を動かしたときに undefined がそのまま流れてしまう。
    settings: settings ?? { inviteCode: "", ...DEFAULT_GROUP_SETTINGS },
    theme,
    onCellTap,
    onToggleMany: toggleMany,
    showTimes: true,
    density: "compact" as const,
  };

  return (
    <>
      {screen === "tasks" ? (
        <Suspense fallback={<LoadingScreen />}>
          <TaskBoardScreen
            groupId={groupId}
            members={activeMembers}
            currentMember={currentMember}
            groups={groups}
            onChangeGroup={onChangeGroup}
            onCreateNewGroup={onCreateNewGroup}
            onChangeScreen={setScreen}
            adminMenuItems={adminMenuItems}
            accountMenuItems={accountMenuItems}
            onExport={() => openDialog({ export: true })}
          />
        </Suspense>
      ) : (
        <div className="min-h-screen bg-page text-ink">
          {/* 上段は所属と補助機能だけにする。設定・メンバー・ログアウトのような
              毎日は使わない操作を平置きすると、日々の入力と同じ重さに見えてしまう。 */}
          <div className="hidden flex-wrap items-center justify-end gap-2 px-5 pt-3.5 md:flex">
            <ShiftModeToggle mode={mode} canConfirm={canConfirm} onChangeMode={changeMode} />
            <button type="button" onClick={() => openDialog({ export: true })} className={HEADER_BTN}>
              書き出し
            </button>
            {adminMenuItems.length > 0 && <HeaderMenu label="管理" items={adminMenuItems} />}
            <HeaderMenu label={currentMember.displayName} items={accountMenuItems} />
          </div>

          <div className="standalone-mobile-header flex flex-wrap items-center justify-end gap-2 px-3 pt-2 md:hidden">
            <ShiftModeToggle mode={mode} canConfirm={canConfirm} onChangeMode={changeMode} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openDialog({ export: true })} className={HEADER_BTN}>
                書き出し
              </button>
              <HeaderMenu label="メニュー" items={[...adminMenuItems, ...accountMenuItems]} />
            </div>
          </div>

          <CalendarNav
            // 週表示でも月単位で動かすので、ラベルは常に「YYYY年M月」
            label={format(anchorDate, "yyyy年M月", { locale: ja })}
            view={view}
            onPrev={() => setAnchorDate((d) => previousMonth(d))}
            onNext={() => setAnchorDate((d) => nextMonth(d))}
            onToday={() => setAnchorDate(new Date())}
            onChangeView={setView}
            groups={groups}
            currentGroupId={groupId}
            onChangeGroup={onChangeGroup}
            onCreateNewGroup={onCreateNewGroup}
            screenSwitcher={<ScreenSwitcher screen="shifts" onChange={setScreen} />}
          />
          <ShiftLegend mode={mode} theme={theme} />
          <MemberFilter
            members={activeMembers}
            currentMemberId={currentMember.id}
            showCurrentMemberOnly={effectiveFilter.showCurrentMemberOnly}
            selectedAttributes={effectiveFilter.attributes as Set<string>}
            nameQuery={effectiveFilter.nameQuery}
            visibleCount={filteredMembers.length}
            nonTargetCount={nonTargets}
            hasActiveFilter={hasActiveFilter(effectiveFilter)}
            onSelectCurrentMember={() =>
              updateFilter({ showCurrentMemberOnly: true, attributes: new Set() })
            }
            onChange={(attributes) => updateFilter({ showCurrentMemberOnly: false, attributes })}
            onChangeNameQuery={(nameQuery) =>
              updateFilter({ nameQuery, showCurrentMemberOnly: false })
            }
            onResetFilters={resetFilters}
          />

          {actions.opError && (
            <div className="mx-auto max-w-[1400px] px-5">
              <p
                role="alert"
                className="rounded-md border border-coral-line bg-coral-wash px-3 py-2 text-[12px] font-bold text-coral"
              >
                {actions.opError}
              </p>
            </div>
          )}

          <main className="mx-auto max-w-[1400px] px-2 pb-[calc(146px+var(--screen-footer-h))] md:px-5 md:pb-[140px]">
            {shifts === undefined || settings === undefined ? (
              <p className="py-8 text-center text-sm text-ink-5">読み込み中...</p>
            ) : shiftsError ? (
              /* 読み込み失敗を「0件」と同じ見た目にすると、予定が無いのか取れていないのか
                 区別できない。原因と、やり直す手段をその場に出す。 */
              <div className="mx-auto max-w-[520px] rounded-xl border border-coral-line bg-coral-wash px-5 py-8 text-center">
                <p role="alert" className="text-[14px] font-bold leading-relaxed text-coral">
                  {shiftsError}
                </p>
                <button type="button" onClick={() => window.location.reload()} className={RETRY_BTN}>
                  再読み込み
                </button>
              </div>
            ) : emptyReason ? (
              /* 0件のときは空の表を見せない。条件で隠れているのかが分からなくなる。 */
              <div className="mx-auto max-w-[560px] rounded-xl border border-line bg-white px-5 py-8 text-center">
                <p className="text-[15px] font-bold leading-relaxed text-ink-2">{emptyReason}</p>
                {hasActiveFilter(effectiveFilter) && (
                  <button type="button" onClick={resetFilters} className={RETRY_BTN}>
                    条件を解除
                  </button>
                )}
              </div>
            ) : view === "list" ? (
              <ShiftListMatrix {...common} />
            ) : view === "month" ? (
              <ShiftMonthGrid {...common} />
            ) : (
              <ShiftWeekView {...common} />
            )}
          </main>

          <BulkEditToolbar
            mode={mode}
            selected={selected}
            shifts={shifts ?? []}
            startTime={startTime}
            endTime={endTime}
            busy={actions.busy}
            onChangeStart={setStartTime}
            onChangeEnd={setEndTime}
            onApply={handleBulk}
            onClear={() => setSelected(new Set())}
            currentMemberId={currentMember.id}
            onOpenSegmentEditor={(k) => openDialog({ editingCell: k })}
            theme={theme}
          />
        </div>
      )}

      <ScreenFooter screen={screen} onChange={setScreen} />

      <AppDialogs
        dialog={dialog}
        onClose={openDialog}
        groupId={groupId}
        anchorDate={anchorDate}
        currentMember={currentMember}
        members={members}
        shifts={shifts ?? []}
        settings={settings}
        shiftTypes={shiftTypes}
        theme={theme}
        busy={actions.busy}
        inviteUrl={inviteUrl}
        inviteLinkCopied={inviteLinkCopied}
        onCopyInviteLink={handleCopyInviteLink}
        onSaveSegments={async (key, next) => {
          if (await actions.saveSegments(key, next)) openDialog({ editingCell: null });
        }}
        onSaveProfile={async (displayName) => {
          if (await actions.saveProfile(displayName)) openDialog({ profile: false });
        }}
        onSaveSettings={async (patch) => {
          if (await actions.saveSettings(patch)) openDialog({ settings: false });
        }}
        onSaveShiftTypes={async (types) => {
          if (await actions.saveShiftTypes(types)) openDialog({ settings: false });
        }}
        onChangeMemberRole={actions.changeMemberRole}
        onChangeMemberActive={actions.changeMemberActive}
        onChangeMemberShiftTarget={actions.changeMemberShiftTarget}
        onChangeMemberDisplayName={actions.changeMemberDisplayName}
        onChangeMemberAttributes={actions.changeMemberAttributes}
      />
    </>
  );
}

export default App;
