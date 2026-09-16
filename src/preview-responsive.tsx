import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  CalendarNav,
  ShiftLegend,
  ShiftListMatrix,
  ShiftMonthGrid,
  ShiftWeekView,
} from "./components/ShiftMatrixViews";
import { MemberFilter } from "./components/MemberFilter";
import { buildShiftTheme } from "./components/shiftTheme";
import { DEFAULT_GROUP_SETTINGS, DEFAULT_SHIFT_TYPES } from "./types";
import type { Member, Shift } from "./types";

type PreviewView = "list" | "month" | "week";

const members: Member[] = ["田村駿貴", "赤間", "曽根", "佐藤", "鈴木", "高橋"].map(
  (displayName, index) => ({
    id: `m${index + 1}`,
    email: `m${index + 1}@example.com`,
    displayName,
    color: ["#248DD4", "#1F8A98", "#D9736F", "#8B5CF6", "#16A34A", "#E08A2E"][index],
    role: index === 0 ? "admin" : "member",
    active: true,
    // 4人目はシフト対象外。対象外の行（氏名は読めて、セルは「—」）を確認するため。
    shiftTarget: index !== 3,
    attributes: index === 0 ? ["社員"] : [index < 4 ? "スタダ" : "社員"],
    joinedAt: null,
  }),
);

const shifts: Shift[] = [
  ["m1", "2026-08-03", "出勤", "09:00", "13:00"],
  ["m1", "2026-08-03", "リモート", "13:00", "18:00"],
  ["m2", "2026-08-03", "出勤", "10:00", "18:00"],
  ["m1", "2026-08-04", "欠勤", null, null],
  ["m3", "2026-08-04", "リモート", "11:00", "19:00"],
].map(([memberId, date, type, startTime, endTime], index) => ({
  id: `s${index}`,
  memberId: memberId!,
  date: date!,
  type: type!,
  startTime: startTime ?? null,
  endTime: endTime ?? null,
  status: index === 1 ? "desired" : "confirmed",
  createdBy: "m1",
  createdAt: null,
  confirmedBy: index === 1 ? null : "m1",
  confirmedAt: null,
  updatedAt: null,
}));

export function Preview() {
  const [view, setView] = useState<PreviewView>("month");
  const [count, setCount] = useState(4);
  const visibleMembers = members.slice(0, count);
  const theme = buildShiftTheme(DEFAULT_SHIFT_TYPES);
  const common = {
    anchorDate: new Date(2026, 7, 1),
    members: visibleMembers,
    shifts,
    currentMemberId: "m1",
    mode: "single" as const,
    selected: new Set<string>(),
    settings: { inviteCode: "", ...DEFAULT_GROUP_SETTINGS },
    theme,
    onCellTap: () => {},
    onToggleMany: () => {},
  };

  return (
    <div className="min-h-screen bg-[#F7F9FB] text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 md:px-5 md:pt-3">
        <p className="text-[12px] font-bold text-[#248DD4]">レスポンシブプレビュー</p>
        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1">
          {[1, 2, 4, 6].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCount(value)}
              className={`rounded px-2.5 py-1 text-[12px] font-bold ${count === value ? "bg-[#248DD4] text-white" : "text-gray-500"}`}
            >
              {value}人
            </button>
          ))}
        </div>
      </div>
      <CalendarNav
        label="2026年8月"
        view={view}
        onPrev={() => {}}
        onNext={() => {}}
        onToday={() => {}}
        onChangeView={setView}
        groups={[{ id: "preview", name: "copia", ownerId: "m1", createdAt: null }]}
        currentGroupId="preview"
        onChangeGroup={() => {}}
        onCreateNewGroup={() => {}}
      />
      <ShiftLegend theme={theme} />
      <MemberFilter
        members={visibleMembers}
        currentMemberId="m1"
        showCurrentMemberOnly={false}
        selectedAttributes={new Set()}
        nameQuery=""
        includeNonTargets={false}
        counts={{ visible: visibleMembers.length, nonTarget: 0 }}
        onSelectCurrentMember={() => setCount(1)}
        onChange={() => {}}
        onChangeNameQuery={() => {}}
        onToggleNonTargets={() => {}}
        onResetFilters={() => {}}
      />
      <main className="mx-auto max-w-[1400px] px-2 pb-10 md:px-5">
        {view === "list" ? (
          <ShiftListMatrix {...common} />
        ) : view === "month" ? (
          <ShiftMonthGrid {...common} />
        ) : (
          <ShiftWeekView {...common} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
