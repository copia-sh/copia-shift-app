import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./config";
import { boardStateFromError, boardStateFromSnapshot, type TaskBoardState } from "../taskBoard";

/**
 * タスク表（閲覧用コピー）を購読する。書き込むのは Worker だけなので、ここに更新関数は置かない。
 * 失敗は権限エラーとそれ以外に分けて返し、画面側で出し分ける。
 */
export function subscribeToTaskBoard(groupId: string, cb: (state: TaskBoardState) => void): () => void {
  return onSnapshot(
    doc(db, "groups", groupId, "taskBoard", "current"),
    (snapshot) => cb(boardStateFromSnapshot(snapshot.exists(), snapshot.data())),
    (error) => {
      console.error("taskBoard subscription failed", error);
      cb(boardStateFromError(error));
    },
  );
}
