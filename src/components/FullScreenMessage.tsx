import type { ReactNode } from "react";

export interface FullScreenMessageProps {
  title: string;
  children?: ReactNode;
  /** 先へ進めない状態のときだけ、抜け道の操作を置く */
  action?: ReactNode;
  /** ログイン画面のような見出しは大きく、待ち時間の表示は控えめにする */
  tone?: "heading" | "quiet";
}

/**
 * 画面いっぱいの1行メッセージ。認証待ち・グループ読み込み待ち・進めない状態で共通に使う。
 *
 * ここを分けて持つと、起動の途中で見た目の違う「読み込み中」が続けて出てしまう。
 * 実際そうなっていたので、1か所に集約している。
 */
export function FullScreenMessage({
  title,
  children,
  action,
  tone = "quiet",
}: FullScreenMessageProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      {tone === "heading" ? (
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      ) : (
        <p className="text-[15px] font-bold text-gray-600">{title}</p>
      )}
      {children}
      {action}
    </div>
  );
}

/** 読み込み中。文言も見た目もここだけで決める。 */
export function LoadingScreen() {
  return <FullScreenMessage title="読み込み中..." />;
}
