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
  cellStateOf,
  canTapCell,
  nextInCycle,
  parseSelKey,
  type BulkOp,
  type CellState,
  type SelKey,
  type ShiftMode,
} from "./components/shiftVisual";
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
  confirmShiftEntry,
  deleteDesiredShiftsBulk,
  registerDesiredShiftsBulk,
  revertShiftEntryToDesired,
  updateShiftEntryDetails,
} from "./firebase/shiftEntries";
import type { Member, ShiftEntry } from "./types";

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

interface Target {
  memberId: string;
  dateKey: string;
  entry?: ShiftEntry;
  state: CellState;
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
  const [mode, setMode] = useState<ShiftMode>("single");
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

  // モードが変わったら選択はクリア(ONのボタンをもう一度押すと single に戻る)
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

  /**
   * 選択のクリアは呼び出し元の責任にする(このヘルパー内で常にクリアすると、
   * single モードでタップ後にパネルを開いたままにする挙動と衝突するため)。
   */
  async function applyOps(targets: Target[], op: BulkOp) {
    setBusy(true);
    try {
      if (op.kind === "desired" || op.kind === "unavailable") {
        const type = op.kind === "desired" ? op.type : "欠勤";
        // 他人の希望は作れないルールなので、自分の分だけ適用
        const mine = targets.filter((t) => t.memberId === currentMember.id);
        const existing = mine.filter((t) => t.entry);
        const fresh = mine.filter((t) => !t.entry);
        // 既存 → 種別だけ部分更新(時間帯を保持)
        await Promise.all(
          existing.map((t) => updateShiftEntryDetails(t.entry!.id, { type })),
        );
        // 未回答からの新規のみ register
        if (fresh.length > 0) {
          await registerDesiredShiftsBulk({
            memberId: currentMember.id,
            dates: fresh.map((t) => t.dateKey),
            type,
            startTime: null,
            endTime: null,
            uid,
          });
        }
      } else if (op.kind === "clear" || op.kind === "reject") {
        // clear は自分の分だけ、reject(却下)は他人の分も対象。
        // どちらも確定済み(fixed)は対象外(削除するとFirestoreルールに拒否され、
        // バッチに含まれる他の対象まで巻き込んで失敗するため)。
        const scope = (op.kind === "clear" ? targets.filter((t) => t.memberId === currentMember.id) : targets)
          .filter((t) => t.state.kind !== "fixed");
        const byMember = new Map<string, string[]>();
        for (const t of scope) byMember.set(t.memberId, [...(byMember.get(t.memberId) ?? []), t.dateKey]);
        await Promise.all(
          [...byMember].map(([memberId, dates]) => deleteDesiredShiftsBulk(memberId, dates)),
        );
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
        await Promise.all(
          targets
            .filter((t) => t.state.kind === "want")
            .map((t) => confirmShiftEntry(t.entry!.id, uid)),
        );
      } else if (op.kind === "revert") {
        await Promise.all(
          targets
            .filter((t) => t.state.kind === "fixed")
            .map((t) => revertShiftEntryToDesired(t.entry!.id)),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function targetOf(k: SelKey): Target {
    const { memberId, dateKey } = parseSelKey(k);
    const entry = entries?.find((e) => e.memberId === memberId && e.date === dateKey);
    return { memberId, dateKey, entry, state: cellStateOf(entry) };
  }

  async function handleBulk(op: BulkOp) {
    await applyOps([...selected].map(targetOf), op);
    setSelected(new Set());
  }

  async function onCellTap(k: SelKey, st: CellState) {
    const { memberId } = parseSelKey(k);
    if (!canTapCell(mode, memberId, currentMember.id, st)) return;

    if (mode === "single") {
      setSelected(new Set([k])); // 下部パネルからも直接ジャンプできるよう選択しておく
      const op = nextInCycle(st); // 未回答→出勤希望→リモート希望→不可→未回答
      if (op) await applyOps([targetOf(k)], op);
      return;
    }
    // multi / review はトグル選択のみ(書き込みは下部パネル)
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const common = {
    anchorDate,
    members,
    entries: entries ?? [],
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
      <ShiftLegend mode={mode} />

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
        mode={mode}
        selected={selected}
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
