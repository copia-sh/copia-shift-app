import { useEffect, useRef } from "react";

export interface HeaderMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

export interface HeaderMenuProps {
  label: string;
  items: HeaderMenuItem[];
  /** 画面幅が狭いときに右端で見切れないよう、開く向きを揃える */
  align?: "left" | "right";
}

/**
 * 上部バーのまとめ役。設定・メンバー・ログアウトのような、毎日は使わない操作を
 * 1つに畳む。日々の入力と同じ重さで平置きすると、押し間違えるし目も散る。
 */
export function HeaderMenu({ label, items, align = "right" }: HeaderMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const node = ref.current;
      if (node?.open && !node.contains(event.target as Node)) {
        node.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary className="flex h-[34px] cursor-pointer list-none items-center gap-1 rounded-md px-2.5 text-[13px] font-bold text-[#6B7280] hover:bg-white/70">
        <span className="max-w-[140px] truncate">{label}</span>
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </summary>
      <div
        className={`absolute top-10 z-40 flex min-w-[170px] flex-col rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              item.onSelect();
              if (ref.current) ref.current.open = false;
            }}
            className="rounded-md px-2.5 py-2 text-left text-[13px] font-bold text-[#374151] hover:bg-[#F4F6F8]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
