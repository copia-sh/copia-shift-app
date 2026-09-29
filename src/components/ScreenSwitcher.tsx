import type { Screen } from "../hooks/screen";

interface ScreenSwitcherProps {
  screen: Screen;
  onChange: (next: Screen) => void;
}

const SCREENS: readonly [Screen, string][] = [
  ["shifts", "シフト"],
  ["tasks", "タスク"],
];

/**
 * PC のヘッダーに置く「シフト｜タスク」。今いる画面を濃い塗りで示し、
 * 画面の中の絞り込み（薄い塗り）と見分けられるようにする。
 */
export function ScreenSwitcher({ screen, onChange }: ScreenSwitcherProps) {
  return (
    <nav aria-label="画面の切り替え" className="hidden overflow-hidden rounded-md border border-[#E5E7EB] md:flex">
      {SCREENS.map(([id, label], index) => (
        <button
          key={id}
          type="button"
          aria-current={screen === id ? "page" : undefined}
          onClick={() => onChange(id)}
          className={`h-[34px] px-4 text-[14px] ${index > 0 ? "border-l border-[#E5E7EB]" : ""} ${
            screen === id ? "bg-[#248DD4] font-bold text-white" : "bg-white text-[#374151]"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * スマホの固定フッター。ヘッダーには切り替えを出さず、入口をここ1つにする。
 * 編集シート・タスク詳細シート（z-50）はこのフッターごと覆う。
 */
export function ScreenFooter({ screen, onChange }: ScreenSwitcherProps) {
  return (
    <nav
      aria-label="画面の切り替え"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E7EB] bg-white px-3 pt-2 shadow-[0_-2px_4px_rgba(57,57,57,0.06)] md:hidden"
      style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
    >
      <div className="flex overflow-hidden rounded-lg border border-[#E5E7EB]">
        {SCREENS.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            aria-current={screen === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`h-12 flex-1 text-[15px] ${index > 0 ? "border-l border-[#E5E7EB]" : ""} ${
              screen === id ? "bg-[#248DD4] font-bold text-white" : "bg-white text-[#374151]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
