import { useEffect, useState } from "react";
import { subscribeToShiftsInRange } from "../firebase/shifts";
import type { Shift } from "../types";

export function useShiftsInRange(
  groupId: string | null,
  startDate: string,
  endDate: string,
) {
  const [shifts, setShifts] = useState<Shift[] | undefined>(undefined);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToShiftsInRange(groupId, startDate, endDate, setShifts);
  }, [groupId, startDate, endDate]);

  return shifts;
}
