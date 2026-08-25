import { useEffect, useState } from "react";
import { subscribeToShiftEntriesInRange } from "../firebase/shiftEntries";
import type { ShiftEntry } from "../types";

export function useShiftEntriesInRange(startDate: string, endDate: string) {
  const [entries, setEntries] = useState<ShiftEntry[] | undefined>(undefined);

  useEffect(() => {
    setEntries(undefined);
    return subscribeToShiftEntriesInRange(startDate, endDate, setEntries);
  }, [startDate, endDate]);

  return entries; // undefined = loading
}
