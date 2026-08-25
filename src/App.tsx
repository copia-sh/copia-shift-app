import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { LoginGate } from "./components/LoginGate";
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
  type BulkOp,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "./components/shiftVisual";
import { useAuthUser } from "./hooks/useAuth";
import { useMembers } from "./hooks/useMembers";
import { useShiftsInRange } from "./hooks/useShifts";
import { useMyGroupIds } from "./hooks/useMyGroupIds";
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
import type { Member, Shift } from "./types";

type ViewMode = "list" | "month" | "week";

function App() {
  const user = useAuthUser();
  const groupIds = useMyGroupIds(user?.uid ?? null);
  const groupId = groupIds?.[0] ?? null;

  if (!user || !groupIds) {
    return <LoginGate user={user} onMemberJoined={() => {}} />;
  }

  if (groupIds.length === 0) {
    return (
      <LoginGate user={user} onMemberJoined={() => {}}>
        {() => (
          <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="text-center">
              <p className="text-gray-600">所属しているグループがありません</p>
              <button
                type="button"
                onClick={() => signOut()}
                className="mt-4 rounded-md px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100"
              >
                ログアウト
              </button>
            </div>
          </div>
        )}
      </LoginGate>
    );
  }

  return (
    <LoginGate user={user} onMemberJoined={() => {}}>
      {(currentUser, currentMember) => (
        <ShiftCalendar
          uid={currentUser.uid}
          currentMember={currentMember}
          groupId={groupId}
        />
      )}
    </LoginGate>
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
  groupId,
}: {
  uid: string;
  currentMember: Member;
  groupId: string;
}) {
  const [view, setView] = useState<ViewMode>("list");
  const [mode, setMode] = useState<ShiftMode>("single");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selected, setSelected] = useState<Set<SelKey>>(new Set());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);

  const members = useMembers(groupId);

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
      const op = nextInCycle(st);
      if (op) await applyOps([targetOf(k)], op);
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
      />
      <ShiftLegend mode={mode} />

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
      />
    </div>
  );
}

export default App;
