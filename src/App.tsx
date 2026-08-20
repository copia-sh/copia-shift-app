import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { LoginGate } from "./components/LoginGate";
import {
  CalendarNav,
  ShiftLegend,
  ShiftListMatrix,
  ShiftMonthGrid,
  ShiftWeekView,
  BulkEditToolbar,
} from "./components/ShiftMatrixViews";
import { cellStateOf, parseSelKey, type BulkOp, type SelKey } from "./components/shiftVisual";
import { useAuthUser } from "./hooks/useAuth";
import { useMembers } from "./hooks/useMembers";
import { useShiftEntriesInRange } from "./hooks/useShiftEntries";
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
  confirmShiftEntriesBulk,
  deleteShiftEntriesBulk,
  registerDesiredShiftsBulk,
  revertShiftEntryToDesired,
  updateShiftEntryDetails,
} from "./firebase/shiftEntries";
import type { Member } from "./types";

type ViewMode = "list" | "month" | "week";

function App() {
  const user = useAuthUser();
  const [membersRefreshKey, setMembersRefreshKey] = useState(0);
  const members = useMembers(!!user, membersRefreshKey);

  return (
    <LoginGate
      user={user}
      members={members}
      onMemberJoined={() => setMembersRefreshKey((k) => k + 1)}
    >
      {(currentUser, currentMember) => (
        <ShiftCalendar
          uid={currentUser.uid}
          currentMember={currentMember}
          members={members ?? []}
        />
      )}
    </LoginGate>
  );
}

function ShiftCalendar({
  uid,
  currentMember,
  members,
}: {
  uid: string;
  currentMember: Member;
  members: Member[];
}) {
  const [view, setView] = useState<ViewMode>("list");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selected, setSelected] = useState<Set<SelKey>>(new Set());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);

  const { startKey, endKey } = useMemo(() => {
    const days = view === "week" ? getWeekDays(anchorDate) : getMonthGridDays(anchorDate);
    return {
      startKey: toDateKey(days[0]),
      endKey: toDateKey(days[days.length - 1]),
    };
  }, [anchorDate, view]);

  const entries = useShiftEntriesInRange(startKey, endKey);

  function handlePrev() {
    setAnchorDate((d) => (view === "week" ? previousWeek(d) : previousMonth(d)));
  }
  function handleNext() {
    setAnchorDate((d) => (view === "week" ? nextWeek(d) : nextMonth(d)));
  }
  function handleToday() {
    setAnchorDate(new Date());
  }

  function toggle(k: SelKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
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
    setBusy(true);
    try {
      const targets = [...selected].map((k) => {
        const { memberId, dateKey } = parseSelKey(k);
        const entry = entries?.find((e) => e.memberId === memberId && e.date === dateKey);
        return { memberId, dateKey, entry, state: cellStateOf(entry) };
      });

      if (op.kind === "desired" || op.kind === "unavailable") {
        // 本人以外の希望は作成できないルールなので、自分の分だけ適用
        const mine = targets.filter((t) => t.memberId === currentMember.id);
        if (mine.length > 0) {
          await registerDesiredShiftsBulk({
            memberId: currentMember.id,
            dates: mine.map((t) => t.dateKey),
            type: op.kind === "desired" ? op.type : "欠勤",
            startTime: null,
            endTime: null,
            uid,
          });
        }
      } else if (op.kind === "clear") {
        // 未回答に戻す(削除)は、確定済みでなければ誰の分でも可能
        const ids = targets
          .filter((t) => t.entry && t.state.kind !== "fixed")
          .map((t) => t.entry!.id);
        if (ids.length > 0) await deleteShiftEntriesBulk(ids);
      } else if (op.kind === "time") {
        await Promise.all(
          targets
            .filter((t) => t.entry)
            .map((t) =>
              updateShiftEntryDetails(t.entry!.id, {
                startTime: op.startTime,
                endTime: op.endTime,
              }),
            ),
        );
      } else if (op.kind === "confirm") {
        const ids = targets
          .filter((t) => t.state.kind === "want" && t.entry)
          .map((t) => t.entry!.id);
        if (ids.length > 0) await confirmShiftEntriesBulk(ids, uid);
      } else if (op.kind === "revert") {
        await Promise.all(
          targets
            .filter((t) => t.state.kind === "fixed" && t.entry)
            .map((t) => revertShiftEntryToDesired(t.entry!.id)),
        );
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  const common = {
    anchorDate,
    members,
    entries: entries ?? [],
    currentMemberId: currentMember.id,
    selected,
    onToggle: toggle,
    onToggleMany: toggleMany,
    showTimes: true,
    density: "compact" as const,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-end gap-3 px-4 pt-3">
        <span className="text-sm text-gray-500">{currentMember.name}</span>
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
      <ShiftLegend />

      <main className="mx-auto max-w-7xl px-4 pb-32">
        {entries === undefined ? (
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
        selected={selected}
        members={members}
        entries={entries ?? []}
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
