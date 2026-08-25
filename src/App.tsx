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
import { useAuthUser } from "./hooks/useAuth";
import { useMembers } from "./hooks/useMembers";
import { useShiftsInRange } from "./hooks/useShifts";
import { useMyGroupIds } from "./hooks/useMyGroupIds";
import { useGroups } from "./hooks/useGroups";
import { signOut } from "./firebase/auth";
import {
  getMonthGridDays,
  getWeekDays,
  nextMonth,
  nextWeek,
  previousMonth,
  previousWeek,
  toDateKey,
} from "./utils/date";
import {
  createShiftsBulk,
  deleteShiftsBulk,
  confirmShift,
  revertShiftToDesired,
  updateShiftDetails,
} from "./firebase/shifts";
import type { Member, Shift, Group, ShiftType } from "./types";

type ViewMode = "list" | "month" | "week";

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
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [editingCell, setEditingCell] = useState<SelKey | null>(null);

  const { startKey, endKey } = useMemo(() => {
    const days = view === "week" ? getWeekDays(anchorDate) : getMonthGridDays(anchorDate);
    return {
      startKey: toDateKey(days[0]),
      endKey: toDateKey(days[days.length - 1]),
    };
  }, [anchorDate, view]);

  const shifts = useShiftsInRange(groupId, startKey, endKey);

  function handlePrev() {
    setAnchorDate((d) => (view === "week" ? previousWeek(d) : previousMonth(d)));
  }
  function handleNext() {
    setAnchorDate((d) => (view === "week" ? nextWeek(d) : nextMonth(d)));
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

  function changeMode(m: ShiftMode) {
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
        const type = op.kind === "desired" ? op.type : "欠勤";
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
    const state = primaryCellState(cellStatesOf(shifts_));
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

  async function onCellTap(k: SelKey, st: CellState) {
    const { memberId } = parseSelKey(k);
    if (!canTapCell(mode, memberId, currentMember.id, st)) return;

    if (mode === "single") {
      setSelected(new Set([k]));
      const target = targetOf(k);
      const cellStates = cellStatesOf(target.shifts);
      if (isSimpleCell(cellStates)) {
        const op = nextInCycle(st);
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

  const common = {
    anchorDate,
    members: members ?? [],
    shifts: shifts ?? [],
    currentMemberId: currentMember.id,
    mode,
    selected,
    onCellTap,
    onToggleMany: toggleMany,
    showTimes: true,
    density: "compact" as const,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-end gap-3 px-4 pt-3">
        <ShiftModeToggle mode={mode} onChangeMode={changeMode} />
        {currentMember.role === "admin" && (
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            {inviteLinkCopied ? "コピーしました" : "招待リンク"}
          </button>
        )}
        <span className="text-sm text-gray-500">{currentMember.displayName}</span>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </div>

      <CalendarNav
        label={
          view === "week"
            ? `${format(anchorDate, "M月d日", { locale: ja })}の週`
            : format(anchorDate, "yyyy年M月", { locale: ja })
        }
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
      <ShiftLegend mode={mode} />

      {opError && (
        <div className="mx-auto max-w-7xl px-4">
          <p
            role="alert"
            className="rounded-md border border-[#F0C7C7] bg-[#FDF1F1] px-3 py-2 text-[12px] font-bold text-[#D9736F]"
          >
            {opError}
          </p>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-32">
        {shifts === undefined ? (
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
      />

      {editingCell && (
        <SegmentEditor
          dateKey={parseSelKey(editingCell).dateKey}
          memberName={currentMember.displayName}
          segments={(shifts ?? []).filter(
            (s) =>
              s.memberId === parseSelKey(editingCell).memberId &&
              s.date === parseSelKey(editingCell).dateKey
          )}
          shiftTypes={["出勤", "リモート", "欠勤"]}
          busy={busy}
          onClose={() => setEditingCell(null)}
          onSave={async (next) => {
            await handleSegmentSave(editingCell, next);
          }}
        />
      )}
    </div>
  );
}

export default App;
