import { useEffect, useState } from "react";
import type { ShiftTypeDef } from "../types";
import { subscribeToShiftTypes } from "../firebase/settings";

export function useShiftTypes(groupId: string | null): ShiftTypeDef[] | undefined {
  const [types, setTypes] = useState<ShiftTypeDef[] | undefined>(undefined);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToShiftTypes(groupId, setTypes);
  }, [groupId]);

  // groupId が無いときの undefined は effect で書き戻さずレンダー中に返す
  // （effect 内の同期 setState は余計な再レンダーを生むため）。
  return groupId ? types : undefined;
}
