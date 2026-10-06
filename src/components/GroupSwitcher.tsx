import type { Group } from "../types";

interface GroupSwitcherProps {
  groups: Group[];
  currentGroupId: string;
  onChange: (id: string) => void;
  onCreateNew: () => void;
}

export function GroupSwitcher({
  groups,
  currentGroupId,
  onChange,
  onCreateNew,
}: GroupSwitcherProps) {
  if (groups.length === 1) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-brand">{groups[0].name}</span>
        <button
          type="button"
          onClick={onCreateNew}
          className="text-[11px] font-bold text-ink-4 hover:text-ink-2"
        >
          ＋新しいグループ
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentGroupId}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink-2 font-semibold"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCreateNew}
        className="text-[11px] font-bold text-ink-4 hover:text-ink-2"
      >
        ＋新しいグループ
      </button>
    </div>
  );
}
