import { useEffect, useState } from "react";
import { subscribeToShiftsInRange } from "../firebase/shifts";
import type { Shift } from "../types";

export function useShiftsInRange(
  groupId: string | null,
  startDate: string,
  endDate: string,
) {
  const queryKey = groupId ? `${groupId}:${startDate}:${endDate}` : "";
  const [result, setResult] = useState<{ queryKey: string; shifts: Shift[] } | null>(null);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToShiftsInRange(groupId, startDate, endDate, (shifts) => {
      setResult({ queryKey, shifts });
    });
  }, [groupId, startDate, endDate, queryKey]);

  return result?.queryKey === queryKey ? result.shifts : undefined;
}
