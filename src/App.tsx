import { useMemo, useState, useEffect } from "react";
import type { User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { LoginGate } from "./components/LoginGate";
import { GroupSetup } from "./components/GroupSetup";
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
  primaryCellState,
  cellStatesOf,
  isSimpleCell,
  type BulkOp,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "./components/shiftVisual";
import { SegmentEditor } from "./components/SegmentEditor";
import { ProfileDialog } from "./components/ProfileDialog";
import { MemberAdmin } from "./components/MemberAdmin";
import { MemberFilter } from "./components/MemberFilter";
import { GroupSettingsDialog } from "./components/GroupSettingsDialog";
import { ExportDialog } from "./components/ExportDialog";
import { ShareLinkDialog } from "./components/ShareLinkDialog";
import { useAuthUser } from "./hooks/useAuth";
import { useMembers } from "./hooks/useMembers";
import { useShiftsInRange } from "./hooks/useShifts";
import { useMyGroupIds } from "./hooks/useMyGroupIds";
import { useGroups } from "./hooks/useGroups";
import { useGroupSettings } from "./hooks/useGroupSettings";
import { useShiftTypes } from "./hooks/useShiftTypes";
import { signOut } from "./firebase/auth";
import {
  updateMemberRole,
  updateMemberActive,
  updateMemberDisplayName,
  updateMemberAttributes,
} from "./firebase/members";
import { updateGroupSettings, updateShiftTypes } from "./firebase/settings";
import {
  getMonthGridDays,
  nextMonth,
  previousMonth,
  toDateKey,
} from "./utils/date";
import {
  createShiftsBulk,
  deleteShiftsBulk,
  confirmShift,
  revertShiftToDesired,
  updateShiftDetails,
} from "./firebase/shifts";
import { DEFAULT_GROUP_SETTINGS, DEFAULT_SHIFT_TYPES, filterMembersByAttributes } from "./types";
import { buildShiftTheme } from "./components/shiftTheme";
import type { Member, Shift, Group, ShiftType, ShiftTypeDef, MemberRole, GroupSettings } from "./types";

type ViewMode = "list" | "month" | "week";

const HEADER_BTN =
  "rounded-md bg-transparent px-2.5 py-1.5 text-[13px] font-bold text-[#6B7280] hover:bg-white/70";

function App() {
  const user = useAuthUser();

  return <LoginGate user={user}>{(currentUser) => <GroupGate user={currentUser} />}</LoginGate>;
}

function Notice({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600">{message}</p>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-4 rounded-md px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}

/**
 * ログイン済みユーザーを、所属グループとその中のメンバー情報に解決する。
 * currentMember は必ず Firestore 上の実データから引く（role や active を
 * 権限判定に使うため、認証情報から組み立てた偽物を渡してはいけない）。
 */
const GROUP_STORAGE_KEY = "copia-shift:groupId";

/** localStorage はプライベートブラウズ等で例外を投げうるので、失敗しても無視する。 */
function readStoredGroupId(): string | null {
  try {
    return localStorage.getItem(GROUP_STORAGE_KEY);
  } catch {
    return null;
  }
}
function storeGroupId(id: string) {
  try {
    localStorage.setItem(GROUP_STORAGE_KEY, id);
  } catch {
    /* 保存できなくても動作に影響はない */
  }
}

function GroupGate({ user }: { user: User }) {
  const groupIds = useMyGroupIds(user.uid);
  const groups = useGroups(groupIds);
  // 「ユーザーが明示的に選んだグループ」だけを state に持つ。実際に表示する
  // グループは groupIds から毎レンダー導出する（effect で state を書き戻すと、
  // 再購読のたびに画面が一瞬 undefined に落ちてフォームが失われる）。
  const [pickedGroupId, setPickedGroupId] = useState<string | null>(readStoredGroupId);
  const [showSetup, setShowSetup] = useState(false);

  const groupId =
    pickedGroupId && groupIds?.includes(pickedGroupId) ? pickedGroupId : (groupIds?.[0] ?? null);

  useEffect(() => {
    if (groupId) storeGroupId(groupId);
  }, [groupId]);

  const members = useMembers(groupId);

  if (!groupIds) {
    return <Notice message="読み込み中..." />;
  }

  if (groupIds.length === 0 || showSetup) {
    return <GroupSetup user={user} onDone={() => setShowSetup(false)} />;
  }

  if (!groupId || !groups || !members) {
    return <Notice message="読み込み中..." />;
  }

  const currentMember = members.find((m) => m.id === user.uid);
  if (!currentMember) {
    return <Notice message="このグループのメンバー情報が見つかりません" />;
  }

  return (
    <ShiftCalendar
      key={groupId}
      uid={user.uid}
      groupId={groupId}
      currentMember={currentMember}
      members={members}
      groups={groups}
      currentGroupId={groupId}
      onChangeGroup={setPickedGroupId}
      onCreateNewGroup={() => setShowSetup(true)}
    />
  );
}

interface Target {
  memberId: string;
  dateKey: string;
  shifts: Shift[];
  state: CellState;
}

function ShiftCalendar({
  uid,
  currentMember,
  members,
  groupId,
  groups,
  currentGroupId,
  onChangeGroup,
  onCreateNewGroup,
}: {
  uid: string;
  currentMember: Member;
  members: Member[];
  groupId: string;
  groups: Group[];
  currentGroupId: string;
  onChangeGroup: (id: string) => void;
  onCreateNewGroup: () => void;
}) {
  const [view, setView] = useState<ViewMode>("list");
  const [mode, setMode] = useState<ShiftMode>("single");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selected, setSelected] = useState<Set<SelKey>>(new Set());
  const [selectedAttributes, setSelectedAttributes] = useState<Set<string>>(new Set());
  const [showCurrentMemberOnly, setShowCurrentMemberOnly] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [editingCell, setEditingCell] = useState<SelKey | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showMemberAdmin, setShowMemberAdmin] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showShareLinkDialog, setShowShareLinkDialog] = useState(false);
  const settings = useGroupSettings(groupId);
  const shiftTypes = useShiftTypes(groupId);

  const theme = useMemo(() => {
    return shiftTypes ? buildShiftTheme(shiftTypes) : null;
  }, [shiftTypes]);

  const { startKey, endKey } = useMemo(() => {
    const days = getMonthGridDays(anchorDate, settings?.weekStartsOn ?? 0);
    return {
      startKey: toDateKey(days[0]),
      endKey: toDateKey(days[days.length - 1]),
    };
  }, [anchorDate, settings?.weekStartsOn]);

  const shifts = useShiftsInRange(groupId, startKey, endKey);

  function handlePrev() {
    setAnchorDate((d) => previousMonth(d));
  }
  function handleNext() {
    setAnchorDate((d) => nextMonth(d));
  }
  function handleToday() {
    setAnchorDate(new Date());
  }

  async function handleCopyInviteLink() {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?g=${groupId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy invite link:", err);
    }
  }

  const canConfirm = currentMember.role === "admin" || currentMember.role === "leader";

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

  async function applyOps(targets: Target[], op: BulkOp) {
    setBusy(true);
    try {
      if (op.kind === "desired" || op.kind === "unavailable") {
        const type = op.type;
        const mine = targets.filter((t) => t.memberId === currentMember.id);
        const existing = mine.filter((t) => t.shifts.length > 0);
        const fresh = mine.filter((t) => t.shifts.length === 0);

        await Promise.all(
          existing.flatMap((t) =>
            t.shifts.map((s) => updateShiftDetails(groupId, s.id, { type }))
          ),
        );

        if (fresh.length > 0) {
          await createShiftsBulk({
            groupId,
            memberId: currentMember.id,
            dates: fresh.map((t) => t.dateKey),
            type,
            startTime: null,
            endTime: null,
            uid,
          });
        }
      } else if (op.kind === "clear") {
        const scope = targets.filter(
          (t) => t.memberId === currentMember.id && t.state.kind !== "fixed",
        );
        const shiftIdsToDelete = scope.flatMap((t) => t.shifts.map((s) => s.id));
        if (shiftIdsToDelete.length > 0) {
          await deleteShiftsBulk(groupId, shiftIdsToDelete);
        }
      } else if (op.kind === "reject") {
        const shiftIds = targets
          .filter((t) => t.shifts.length > 0 && t.state.kind !== "fixed")
          .flatMap((t) => t.shifts.map((s) => s.id));
        await Promise.all(
          shiftIds.map((id) =>
            updateShiftDetails(groupId, id, { type: "却下" })
          ),
        );
      } else if (op.kind === "time") {
        const shiftIds = targets.flatMap((t) => t.shifts.map((s) => s.id));
        await Promise.all(
          shiftIds.map((id) =>
            updateShiftDetails(groupId, id, {
              startTime: op.startTime,
              endTime: op.endTime,
            })
          ),
        );
      } else if (op.kind === "confirm") {
        const shiftIds = targets
          .filter((t) => t.state.kind === "want")
          .flatMap((t) => t.shifts.map((s) => s.id));
        await Promise.all(
          shiftIds.map((id) => confirmShift(groupId, id, uid)),
        );
      } else if (op.kind === "revert") {
        const shiftIds = targets
          .filter((t) => t.state.kind === "fixed")
          .flatMap((t) => t.shifts.map((s) => s.id));
        await Promise.all(
          shiftIds.map((id) => revertShiftToDesired(groupId, id)),
        );
      }
      setOpError(null);
    } catch (err) {
      // 権限が無い操作はセキュリティルールに拒否される。握り潰すと画面上は
      // 何も起きなかったように見えるので、必ず理由を出す。
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません（確定・却下は管理者とリーダーのみ）"
          : "操作に失敗しました。通信状況を確認してもう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  function targetOf(k: SelKey): Target {
    const { memberId, dateKey } = parseSelKey(k);
    const shifts_ = (shifts ?? []).filter((s) => s.memberId === memberId && s.date === dateKey);
    const unavailableKeys = theme?.unavailableKeys ?? new Set();
    const state = primaryCellState(cellStatesOf(shifts_, unavailableKeys));
    return { memberId, dateKey, shifts: shifts_, state };
  }

  async function handleSegmentSave(
    k: SelKey,
    next: { id?: string; type: string; startTime: string | null; endTime: string | null }[]
  ) {
    setBusy(true);
    try {
      const target = targetOf(k);
      const existing = new Set(target.shifts.map((s) => s.id));
      const nextIds = new Set(next.filter((n) => n.id).map((n) => n.id!));

      for (const seg of next) {
        if (seg.id) {
          await updateShiftDetails(groupId, seg.id, {
            type: seg.type as ShiftType,
            startTime: seg.startTime,
            endTime: seg.endTime,
          });
        } else {
          await createShiftsBulk({
            groupId,
            memberId: currentMember.id,
            dates: [target.dateKey],
            type: seg.type as ShiftType,
            startTime: seg.startTime,
            endTime: seg.endTime,
            uid,
          });
        }
      }

      const toDelete = [...existing].filter((id) => !nextIds.has(id));
      if (toDelete.length > 0) {
        await deleteShiftsBulk(groupId, toDelete);
      }

      setOpError(null);
      setEditingCell(null);
    } catch (err) {
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません"
          : "操作に失敗しました。通信状況を確認してもう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleBulk(op: BulkOp) {
    await applyOps([...selected].map(targetOf), op);
    if (op.kind === "desired") return;
    setSelected(new Set());
  }

  async function handleSaveProfile(displayName: string) {
    setBusy(true);
    try {
      await updateMemberDisplayName(groupId, currentMember.id, displayName);
      setOpError(null);
      setShowProfileDialog(false);
    } catch (err) {
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません"
          : "操作に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMemberRoleChange(memberId: string, role: MemberRole) {
    setBusy(true);
    try {
      await updateMemberRole(groupId, memberId, role);
      setOpError(null);
    } catch (err) {
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません"
          : "操作に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMemberActiveChange(memberId: string, active: boolean) {
    setBusy(true);
    try {
      await updateMemberActive(groupId, memberId, active);
      setOpError(null);
    } catch (err) {
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません"
          : "操作に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMemberDisplayNameChange(memberId: string, displayName: string) {
    setBusy(true);
    try {
      await updateMemberDisplayName(groupId, memberId, displayName);
      setOpError(null);
    } catch (err) {
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません"
          : "操作に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMemberAttributesChange(memberId: string, attributes: string[]) {
    setBusy(true);
    try {
      await updateMemberAttributes(groupId, memberId, attributes);
      setOpError(null);
    } catch (err) {
      const denied =
        err instanceof FirebaseError
          ? err.code === "permission-denied"
          : String(err).includes("permission-denied");
      setOpError(
        denied
          ? "この操作を行う権限がありません"
          : "操作に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusy(false);
    }
  }

  function describeWriteError(err: unknown): string {
    const denied =
      err instanceof FirebaseError
        ? err.code === "permission-denied"
        : String(err).includes("permission-denied");
    return denied
      ? "この操作を行う権限がありません"
      : "操作に失敗しました。もう一度お試しください。";
  }

  async function handleSaveSettings(patch: Partial<GroupSettings>) {
    setBusy(true);
    try {
      await updateGroupSettings(groupId, patch);
      setOpError(null);
      setShowSettingsDialog(false);
    } catch (err) {
      setOpError(describeWriteError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveShiftTypes(types: ShiftTypeDef[]) {
    setBusy(true);
    try {
      await updateShiftTypes(groupId, types);
      setOpError(null);
      setShowSettingsDialog(false);
    } catch (err) {
      setOpError(describeWriteError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCellTap(k: SelKey, st: CellState) {
    const { memberId } = parseSelKey(k);
    if (!canTapCell(mode, memberId, currentMember.id, st)) return;

    if (mode === "single") {
      setSelected(new Set([k]));
      const target = targetOf(k);
      const unavailableKeys = theme?.unavailableKeys ?? new Set();
      const cellStates = cellStatesOf(target.shifts, unavailableKeys);
      if (isSimpleCell(cellStates)) {
        const cycleKeys = theme?.cycleKeys ?? [];
        const op = nextInCycle(st, cycleKeys);
        if (op) await applyOps([target], op);
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

  const activeMembers = useMemo(() => {
    return (members ?? []).filter((m) => m.active);
  }, [members]);
  const effectiveSelectedAttributes = useMemo(() => {
    const available = new Set(activeMembers.flatMap((member) => member.attributes));
    return new Set([...selectedAttributes].filter((attribute) => available.has(attribute)));
  }, [activeMembers, selectedAttributes]);
  const filteredMembers = useMemo(() => {
    if (showCurrentMemberOnly) {
      return activeMembers.filter((member) => member.id === currentMember.id);
    }
    return filterMembersByAttributes(activeMembers, effectiveSelectedAttributes);
  }, [activeMembers, currentMember.id, effectiveSelectedAttributes, showCurrentMemberOnly]);

  function handleMemberFilterChange(attributes: Set<string>) {
    setShowCurrentMemberOnly(false);
    setSelectedAttributes(attributes);
    setSelected(new Set());
  }

  function handleSelectCurrentMember() {
    setShowCurrentMemberOnly(true);
    setSelectedAttributes(new Set());
    setSelected(new Set());
  }

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
    <div className="min-h-screen" style={{ background: "var(--c-page)", color: "var(--c-ink)" }}>
      {/* 1段目: モードと管理系。テキストボタンは 13px/700 / #6B7280 / padding 6px 10px */}
      <div className="hidden flex-wrap items-center justify-end gap-2.5 px-5 pt-3.5 md:flex">
        <ShiftModeToggle mode={mode} canConfirm={canConfirm} onChangeMode={changeMode} />
        <button type="button" onClick={() => setShowExportDialog(true)} className={HEADER_BTN}>
          書き出し
        </button>
        <button type="button" onClick={() => setShowShareLinkDialog(true)} className={HEADER_BTN}>
          カレンダー購読
        </button>
        {currentMember.role === "admin" && (
          <button type="button" onClick={() => setShowSettingsDialog(true)} className={HEADER_BTN}>
            設定
          </button>
        )}
        {currentMember.role === "admin" && (
          <button type="button" onClick={() => setShowMemberAdmin(true)} className={HEADER_BTN}>
            メンバー
          </button>
        )}
        <button type="button" onClick={() => setShowProfileDialog(true)} className={HEADER_BTN}>
          {currentMember.displayName}
        </button>
        <button type="button" onClick={() => signOut()} className={HEADER_BTN}>
          ログアウト
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 pt-2 md:hidden">
        <ShiftModeToggle mode={mode} canConfirm={canConfirm} onChangeMode={changeMode} />
        <details className="relative ml-auto">
          <summary className={`${HEADER_BTN} cursor-pointer list-none border border-gray-200 bg-white shadow-[0_2px_0_0_#E3E3E3]`}>
            メニュー
          </summary>
          <div className="absolute right-0 top-10 z-40 flex min-w-[150px] flex-col rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
            <button type="button" onClick={() => setShowExportDialog(true)} className={`${HEADER_BTN} text-left`}>書き出し</button>
            <button type="button" onClick={() => setShowShareLinkDialog(true)} className={`${HEADER_BTN} text-left`}>カレンダー購読</button>
            {currentMember.role === "admin" && (
              <button type="button" onClick={() => setShowSettingsDialog(true)} className={`${HEADER_BTN} text-left`}>設定</button>
            )}
            {currentMember.role === "admin" && (
              <button type="button" onClick={() => setShowMemberAdmin(true)} className={`${HEADER_BTN} text-left`}>メンバー</button>
            )}
            <button type="button" onClick={() => setShowProfileDialog(true)} className={`${HEADER_BTN} text-left`}>{currentMember.displayName}</button>
            <button type="button" onClick={() => signOut()} className={`${HEADER_BTN} text-left`}>ログアウト</button>
          </div>
        </details>
      </div>

      <CalendarNav
        // 週表示でも月単位で動かすので、ラベルは常に「YYYY年M月」
        label={format(anchorDate, "yyyy年M月", { locale: ja })}
        view={view}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onChangeView={setView}
        groups={groups}
        currentGroupId={currentGroupId}
        onChangeGroup={onChangeGroup}
        onCreateNewGroup={onCreateNewGroup}
      />
      <ShiftLegend mode={mode} theme={theme} />
      <MemberFilter
        members={activeMembers}
        currentMemberId={currentMember.id}
        showCurrentMemberOnly={showCurrentMemberOnly}
        selectedAttributes={effectiveSelectedAttributes}
        onSelectCurrentMember={handleSelectCurrentMember}
        onChange={handleMemberFilterChange}
      />

      {opError && (
        <div className="mx-auto max-w-[1400px] px-5">
          <p
            role="alert"
            className="rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-3 py-2 text-[12px] font-bold text-[#D9736F]"
          >
            {opError}
          </p>
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-2 pb-[120px] md:px-5 md:pb-[140px]">
        {shifts === undefined || settings === undefined ? (
          <p className="py-8 text-center text-sm text-gray-400">読み込み中...</p>
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
        busy={busy}
        onChangeStart={setStartTime}
        onChangeEnd={setEndTime}
        onApply={handleBulk}
        onClear={() => setSelected(new Set())}
        currentMemberId={currentMember.id}
        onOpenSegmentEditor={(k) => setEditingCell(k)}
        theme={theme}
      />

      {editingCell && settings && theme && (
        <SegmentEditor
          dateKey={parseSelKey(editingCell).dateKey}
          memberName={currentMember.displayName}
          segments={(shifts ?? []).filter(
            (s) =>
              s.memberId === parseSelKey(editingCell).memberId &&
              s.date === parseSelKey(editingCell).dateKey
          )}
          theme={theme}
          busy={busy}
          maxSegments={settings.maxSegmentsPerDay}
          onClose={() => setEditingCell(null)}
          onSave={async (next) => {
            await handleSegmentSave(editingCell, next);
          }}
        />
      )}

      {showProfileDialog && (
        <ProfileDialog
          member={currentMember}
          busy={busy}
          onClose={() => setShowProfileDialog(false)}
          onSave={handleSaveProfile}
        />
      )}

      {showMemberAdmin && (
        <MemberAdmin
          members={members}
          currentMemberId={currentMember.id}
          canManage={currentMember.role === "admin"}
          busy={busy}
          onClose={() => setShowMemberAdmin(false)}
          onChangeRole={handleMemberRoleChange}
          onChangeActive={handleMemberActiveChange}
          onChangeDisplayName={handleMemberDisplayNameChange}
          onChangeAttributes={handleMemberAttributesChange}
        />
      )}

      {showSettingsDialog && settings && (
        <GroupSettingsDialog
          settings={settings}
          shiftTypes={shiftTypes ?? DEFAULT_SHIFT_TYPES}
          inviteUrl={`${window.location.origin}${window.location.pathname}?g=${groupId}`}
          inviteLinkCopied={inviteLinkCopied}
          onCopyInviteLink={handleCopyInviteLink}
          busy={busy}
          onClose={() => setShowSettingsDialog(false)}
          onSave={handleSaveSettings}
          onSaveTypes={handleSaveShiftTypes}
        />
      )}

      {showExportDialog && theme && (
        <ExportDialog
          anchorDate={anchorDate}
          groupId={groupId}
          currentMemberId={currentMember.id}
          theme={theme}
          busy={busy}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {showShareLinkDialog && theme && (
        <ShareLinkDialog
          groupId={groupId}
          currentMemberId={currentMember.id}
          theme={theme}
          busy={busy}
          onClose={() => setShowShareLinkDialog(false)}
        />
      )}
    </div>
  );
}

export default App;
