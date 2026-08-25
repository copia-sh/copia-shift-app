import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./config";
import type { GroupSettings, ShiftTypeDef } from "../types";
import { DEFAULT_GROUP_SETTINGS, DEFAULT_SHIFT_TYPES } from "../types";

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
  // updateDoc ではなく setDoc + merge。グループ作成より後に増えた設定項目は
  // 既存グループのドキュメントに無いことがあり、updateDoc だと失敗する。
  await setDoc(settingsRef, fields, { merge: true });
}

export function subscribeToShiftTypes(
  groupId: string,
  cb: (types: ShiftTypeDef[]) => void,
): () => void {
  const typesRef = doc(db, "groups", groupId, "settings", "shiftTypes");
  return onSnapshot(
    typesRef,
    (snapshot) => {
      const raw = snapshot.data();
      const types = (raw?.types as ShiftTypeDef[] | undefined) ?? DEFAULT_SHIFT_TYPES;
      cb(types);
    },
    () => {
      cb(DEFAULT_SHIFT_TYPES);
    },
  );
}

export async function updateShiftTypes(groupId: string, types: ShiftTypeDef[]): Promise<void> {
  const typesRef = doc(db, "groups", groupId, "settings", "shiftTypes");
  // settings/shiftTypes はグループ作成時には作られないので、必ず setDoc で作る。
  await setDoc(typesRef, { types });
}
