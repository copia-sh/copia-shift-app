import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "./config";
import type { GroupSettings } from "../types";
import { DEFAULT_GROUP_SETTINGS } from "../types";

export function withDefaults(raw: Record<string, unknown> | undefined): GroupSettings {
  return {
    inviteCode: (raw?.inviteCode as string) ?? "",
    displayStartHour: (raw?.displayStartHour as number) ?? DEFAULT_GROUP_SETTINGS.displayStartHour,
    displayEndHour: (raw?.displayEndHour as number) ?? DEFAULT_GROUP_SETTINGS.displayEndHour,
    weekStartsOn: (raw?.weekStartsOn as 0 | 1) ?? DEFAULT_GROUP_SETTINGS.weekStartsOn,
    maxSegmentsPerDay: (raw?.maxSegmentsPerDay as number) ?? DEFAULT_GROUP_SETTINGS.maxSegmentsPerDay,
  };
}

export function subscribeToGroupSettings(
  groupId: string,
  cb: (s: GroupSettings) => void,
): () => void {
  const settingsRef = doc(db, "groups", groupId, "settings", "general");
  return onSnapshot(
    settingsRef,
    (snapshot) => {
      const raw = snapshot.data();
      const settings = withDefaults(raw);
      cb(settings);
    },
    () => {
      cb(withDefaults(undefined));
    },
  );
}

export async function updateGroupSettings(
  groupId: string,
  patch: Partial<GroupSettings>,
): Promise<void> {
  const settingsRef = doc(db, "groups", groupId, "settings", "general");
  // Firestore は undefined を受け付けないので、値のある項目だけ送る。
  const fields = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(fields).length === 0) return;
  await updateDoc(settingsRef, fields);
}
