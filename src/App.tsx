import { useMemo, useState } from "react";
import { LoginGate } from "./components/LoginGate";
import { Header, type ViewMode } from "./components/Header";
import { MonthView } from "./components/MonthView";
import { WeekView } from "./components/WeekView";
import {
  MonthMatrixView,
  MatrixLegend,
  CellActionSheet,
  type CellState,
} from "./components/MonthMatrixView";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { ShiftDetailPopover } from "./components/ShiftDetailPopover";
import { CreateShiftModal } from "./components/CreateShiftModal";
import { useAuthUser } from "./hooks/useAuth";
import { useMembers } from "./hooks/useMembers";
import { useShiftEntriesInRange } from "./hooks/useShiftEntries";
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
  confirmShiftEntry,
  deleteDesiredShiftsBulk,
  deleteShiftEntry,
  registerDesiredShiftsBulk,
  revertShiftEntryToDesired,
  updateShiftEntryDetails,
} from "./firebase/shiftEntries";
import type { Member, ShiftEntry, ShiftType } from "./types";

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
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [createAtDateKey, setCreateAtDateKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    { dateKey: string; member: Member; entry?: ShiftEntry } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const { startKey, endKey } = useMemo(() => {
    const days =
      viewMode === "week" ? getWeekDays(anchorDate) : getMonthGridDays(anchorDate);
    return {
      startKey: toDateKey(days[0]),
      endKey: toDateKey(days[days.length - 1]),
    };
  }, [anchorDate, viewMode]);

  const entries = useShiftEntriesInRange(startKey, endKey);

  const selectedEntry = entries?.find((e) => e.id === selectedEntryId) ?? null;
  const selectedEntryMember = selectedEntry
    ? members.find((m) => m.id === selectedEntry.memberId) ?? null
    : null;

  function handlePrev() {
    setAnchorDate((d) => (viewMode === "week" ? previousWeek(d) : previousMonth(d)));
  }
  function handleNext() {
    setAnchorDate((d) => (viewMode === "week" ? nextWeek(d) : nextMonth(d)));
  }
  function handleToday() {
    setAnchorDate(new Date());
  }

  function toggleDateSelect(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  const ownDesiredSelectedCount = entries
    ? [...selectedDates].filter((dateKey) =>
        entries.some(
          (e) =>
            e.date === dateKey &&
            e.memberId === currentMember.id &&
            e.status === "desired",
        ),
      ).length
    : 0;

  async function handleRegister(type: ShiftType) {
    setBusy(true);
    try {
      await registerDesiredShiftsBulk({
        memberId: currentMember.id,
        dates: [...selectedDates],
        type,
        startTime: null,
        endTime: null,
        uid,
      });
      setSelectedDates(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteOwn() {
    setBusy(true);
    try {
      const ownDates = entries
        ? [...selectedDates].filter((dateKey) =>
            entries.some(
              (e) =>
                e.date === dateKey &&
                e.memberId === currentMember.id &&
                e.status === "desired",
            ),
          )
        : [...selectedDates];
      await deleteDesiredShiftsBulk(currentMember.id, ownDates);
      setSelectedDates(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!selectedEntry) return;
    setBusy(true);
    try {
      await confirmShiftEntry(selectedEntry.id, uid);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert() {
    if (!selectedEntry) return;
    setBusy(true);
    try {
      await revertShiftEntryToDesired(selectedEntry.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSelectedEntry() {
    if (!selectedEntry) return;
    setBusy(true);
    try {
      await deleteShiftEntry(selectedEntry.id);
      setSelectedEntryId(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateDetails(updates: {
    type?: ShiftType;
    startTime?: string | null;
    endTime?: string | null;
  }) {
    if (!selectedEntry) return;
    setBusy(true);
    try {
      await updateShiftEntryDetails(selectedEntry.id, updates);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTimedShift(params: {
    type: ShiftType;
    startTime: string | null;
    endTime: string | null;
  }) {
    if (!createAtDateKey) return;
    setBusy(true);
    try {
      await registerDesiredShiftsBulk({
        memberId: currentMember.id,
        dates: [createAtDateKey],
        type: params.type,
        startTime: params.startTime,
        endTime: params.endTime,
        uid,
      });
      setCreateAtDateKey(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCycleOwn(
    dateKey: string,
    _from: CellState,
    to: CellState,
    entry: ShiftEntry | undefined,
  ) {
    setBusy(true);
    try {
      if (to === "want") {
        await registerDesiredShiftsBulk({
          memberId: currentMember.id,
          dates: [dateKey],
          type: "出勤",
          startTime: null,
          endTime: null,
          uid,
        });
      } else if (to === "no") {
        if (entry) await updateShiftEntryDetails(entry.id, { type: "欠勤" });
        else
          await registerDesiredShiftsBulk({
            memberId: currentMember.id,
            dates: [dateKey],
            type: "欠勤",
            startTime: null,
            endTime: null,
            uid,
          });
      } else {
        await deleteDesiredShiftsBulk(currentMember.id, [dateKey]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        currentMember={currentMember}
        anchorDate={anchorDate}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />

      <main className="mx-auto max-w-7xl p-4">
        {entries === undefined ? (
          <p className="text-center text-sm text-gray-400">読み込み中...</p>
        ) : viewMode === "matrix" ? (
          <>
            <MatrixLegend />
            <MonthMatrixView
              anchorDate={anchorDate}
              members={members}
              entries={entries}
              currentMemberId={currentMember.id}
              busy={busy}
              onCycleOwn={handleCycleOwn}
              onOpenCell={(dateKey, member, entry) => setSheet({ dateKey, member, entry })}
            />
          </>
        ) : viewMode === "month" ? (
          <MonthView
            anchorDate={anchorDate}
            members={members}
            entries={entries}
            selectedDates={selectedDates}
            onToggleDateSelect={toggleDateSelect}
            onOpenEntry={(entry) => setSelectedEntryId(entry.id)}
          />
        ) : (
          <WeekView
            anchorDate={anchorDate}
            members={members}
            entries={entries}
            onOpenEntry={(entry) => setSelectedEntryId(entry.id)}
            onCreateAt={(dateKey) => setCreateAtDateKey(dateKey)}
          />
        )}
      </main>

      {viewMode === "month" && (
        <SelectionToolbar
          selectedCount={selectedDates.size}
          onRegister={handleRegister}
          onDeleteOwn={handleDeleteOwn}
          onClear={() => setSelectedDates(new Set())}
          canDelete={ownDesiredSelectedCount > 0}
          busy={busy}
        />
      )}

      {selectedEntry && selectedEntryMember && (
        <ShiftDetailPopover
          entry={selectedEntry}
          member={selectedEntryMember}
          isOwnEntry={selectedEntry.memberId === currentMember.id}
          busy={busy}
          onClose={() => setSelectedEntryId(null)}
          onConfirm={handleConfirm}
          onRevert={handleRevert}
          onDelete={handleDeleteSelectedEntry}
          onUpdateDetails={handleUpdateDetails}
        />
      )}

      {createAtDateKey && (
        <CreateShiftModal
          dateKey={createAtDateKey}
          busy={busy}
          onClose={() => setCreateAtDateKey(null)}
          onCreate={handleCreateTimedShift}
        />
      )}

      {sheet && (
        <CellActionSheet
          dateKey={sheet.dateKey}
          member={sheet.member}
          entry={sheet.entry}
          busy={busy}
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            if (sheet.entry) await confirmShiftEntry(sheet.entry.id, uid);
            setSheet(null);
          }}
          onRevert={async () => {
            if (sheet.entry) await revertShiftEntryToDesired(sheet.entry.id);
            setSheet(null);
          }}
          onRegisterDesired={async (type) => {
            await registerDesiredShiftsBulk({
              memberId: sheet.member.id,
              dates: [sheet.dateKey],
              type,
              startTime: null,
              endTime: null,
              uid,
            });
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
