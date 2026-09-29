import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "./TaskBadges";

interface StatusFilterProps {
  options: readonly { status: string; count: number }[];
  /** null はすべて選択 */
  selected: ReadonlySet<string> | null;
  onChange: (next: ReadonlySet<string> | null) => void;
}

function label(selected: ReadonlySet<string> | null): string {
  if (selected === null) return "ステータス：すべて";
  if (selected.size === 0) return "ステータス：なし";
  return [...selected].join("・");
}

/** 選んだ状態を次の集合にする。全部に戻ったら「すべて」（null）として持つ。 */
function toggle(options: readonly string[], selected: ReadonlySet<string> | null, status: string): ReadonlySet<string> | null {
  const next = new Set(selected ?? options);
  if (next.has(status)) next.delete(status);
  else next.add(status);
  return options.every((option) => next.has(option)) ? null : next;
}

export function StatusFilter({ options, selected, onChange }: StatusFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = selected !== null;
  const statuses = options.map((option) => option.status);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[44px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-bold md:h-[34px] md:min-h-0 md:rounded-md ${
          active ? "border-[#248DD4] bg-[#D1E9F9] text-[#0863A0]" : "border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50"
        }`}
      >
        <span className="max-w-[160px] truncate">{label(selected)}</span>
        <span aria-hidden className="text-[10px]">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-60 rounded-lg border border-[#E5E7EB] bg-white p-1.5 shadow-[0_4px_12px_rgba(57,57,57,0.16)] md:left-auto md:right-0">
          <fieldset>
            <legend className="sr-only">表示するステータス</legend>
            {options.map(({ status, count }) => (
              <label key={status} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-[#F4F6F8]">
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px] accent-[#248DD4]"
                  checked={selected === null || selected.has(status)}
                  onChange={() => onChange(toggle(statuses, selected, status))}
                />
                <StatusBadge status={status} />
                <span className="ml-auto text-[13px] text-[#6B7280]">{count}</span>
              </label>
            ))}
          </fieldset>
          <div className="mt-1 flex items-center justify-between border-t border-[#F1F3F5] px-2 pt-2 pb-1">
            <span className="text-[12px] text-[#6B7280]">完了は表示しません</span>
            <button type="button" onClick={() => onChange(null)} className="text-[13px] font-bold text-[#248DD4]">
              すべて選択
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
