import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { parseStudyRoomBoard, type StudyRoomState } from "../studyRooms";

export function useStudyRooms(groupId: string, enabled: boolean): StudyRoomState {
  const [snapshot, setSnapshot] = useState<{ groupId: string; state: StudyRoomState } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(doc(db, "groups", groupId, "taskBoard", "studyRooms"), (doc) => {
      const board = parseStudyRoomBoard(doc.data());
      setSnapshot({ groupId, state: board ? { kind: "ready", board } : { kind: "unavailable" } });
    }, () => setSnapshot({ groupId, state: { kind: "unavailable" } }));
  }, [groupId, enabled]);
  return enabled && snapshot?.groupId === groupId ? snapshot.state : { kind: "loading" };
}
