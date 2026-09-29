/** アプリの最上位の画面。シフト画面の中のタブ（見る・入力・確定）とは別の階層。 */
export type Screen = "shifts" | "tasks";

const TASKS_HASH = "#tasks";

/** URLのハッシュで画面を持つ。再読み込みやブラウザの戻るで同じ画面に戻れるようにする。 */
export function screenFromHash(hash: string): Screen {
  return hash === TASKS_HASH ? "tasks" : "shifts";
}

export function hashForScreen(screen: Screen): string {
  return screen === "tasks" ? TASKS_HASH : "";
}
