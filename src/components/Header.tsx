import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { signOut } from "../firebase/auth";
import type { Member } from "../types";

export type ViewMode = "matrix" | "month" | "week";

interface HeaderProps {
  currentMember: Member;
  anchorDate: Date;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function Header({
  currentMember,
  anchorDate,
  viewMode,
  onChangeViewMode,
  onPrev,
  onNext,
  onToday,
}: HeaderProps) {
  const label =
    viewMode === "week"
      ? `${format(anchorDate, "yyyy年M月d日", { locale: ja })}の週`
      : format(anchorDate, "yyyy年M月", { locale: ja });

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">Copia シフト管理</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onToday}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            今月
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
          >
            →
          </button>
        </div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => onChangeViewMode("matrix")}
            className={`px-3 py-1.5 text-sm ${
              viewMode === "matrix" ? "bg-blue-600 text-white" : "text-gray-600"
            }`}
          >
            一覧
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("month")}
            className={`px-3 py-1.5 text-sm ${
              viewMode === "month" ? "bg-blue-600 text-white" : "text-gray-600"
            }`}
          >
            月
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("week")}
            className={`px-3 py-1.5 text-sm ${
              viewMode === "week" ? "bg-blue-600 text-white" : "text-gray-600"
            }`}
          >
            週
          </button>
        </div>
        <span className="text-sm text-gray-500">{currentMember.name}</span>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
