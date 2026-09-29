import { useEffect, useState } from "react";
import { subscribeToTaskBoard } from "../firebase/taskBoard";
import type { TaskBoardState } from "../taskBoard";

/** `enabled` が false の間は購読しない（タスク画面を開くまで読み取りを発生させない）。 */
export function useTaskBoard(groupId: string | null, enabled: boolean): TaskBoardState {
  const [state, setState] = useState<{ key: string; value: TaskBoardState } | null>(null);
  const key = groupId && enabled ? groupId : null;

  useEffect(() => {
    if (!key) return;
    return subscribeToTaskBoard(key, (value) => setState({ key, value }));
  }, [key]);

  // グループを切り替えた直後は、前のグループの内容を出さずに読み込み中にする。
  return state && state.key === key ? state.value : { kind: "loading" };
}
