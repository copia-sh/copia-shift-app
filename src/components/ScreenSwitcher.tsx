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
 * PC のヘッダーに置く「シフト｜タスク」。隣の「一覧｜月｜週」と同じ型にそろえ、
 * 今いる画面を濃い塗りで示す（画面の中の絞り込みは薄い塗り）。
 */
export function ScreenSwitcher({ screen, onChange }: ScreenSwitcherProps) {
  return (
    <nav aria-label="画面の切り替え" className="hidden overflow-hidden rounded-md border border-gray-200 shadow-[0_2px_0_0_#E3E3E3] md:flex">
      {SCREENS.map(([id, label], index) => (
        <button
          key={id}
          type="button"
          aria-current={screen === id ? "page" : undefined}
          onClick={() => onChange(id)}
          className={`h-[34px] px-3.5 text-[13px] font-bold ${index > 0 ? "border-l border-gray-200" : ""} ${
            screen === id ? "bg-[#248DD4] text-white" : "bg-white text-gray-700"
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
 * 見た目はヘッダーの「シフト｜タスク」や「一覧｜月｜週」と同じ型にそろえ、高さだけ押しやすい44pxにする。
 * 土台は下に長く取り、ボタンをその上の方に置く（ホームバーと重ならないように）。
 * 編集シート・タスク詳細シート（z-50）はこのフッターごと覆う。
 */
export function ScreenFooter({ screen, onChange }: ScreenSwitcherProps) {
  return (
    <nav
      aria-label="画面の切り替え"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-3 pt-2.5 backdrop-blur md:hidden"
      style={{ paddingBottom: "var(--screen-footer-pad)" }}
    >
      <div className="flex overflow-hidden rounded-md border border-gray-200 shadow-[0_2px_0_0_#E3E3E3]">
        {SCREENS.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            aria-current={screen === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`h-11 flex-1 text-[13px] font-bold ${index > 0 ? "border-l border-gray-200" : ""} ${
              screen === id ? "bg-[#248DD4] text-white" : "bg-white text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
