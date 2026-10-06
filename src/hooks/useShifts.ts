import { useEffect, useState } from "react";
import { subscribeToShiftsInRange } from "../firebase/shifts";
import { describeLoadError } from "../utils/errorMessage";
import type { Shift } from "../types";

export interface ShiftsResult {
  /** 未取得のうちは undefined。読み込み失敗は error に入れ、0件と区別する */
  shifts: Shift[] | undefined;
  error: string | null;
}

export function useShiftsInRange(
  groupId: string | null,
  startDate: string,
  endDate: string,
): ShiftsResult {
  const queryKey = groupId ? `${groupId}:${startDate}:${endDate}` : "";
  const [result, setResult] = useState<{
    queryKey: string;
    shifts: Shift[] | undefined;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToShiftsInRange(
      groupId,
      startDate,
      endDate,
      (shifts) => setResult({ queryKey, shifts, error: null }),
      // 失敗時に undefined のままにすると、読み込み中の表示が消えない。
      // 0件として扱い、理由を別に持たせる。
      (error) => setResult({ queryKey, shifts: [], error: describeLoadError(error) }),
    );
  }, [groupId, startDate, endDate, queryKey]);

  if (result?.queryKey !== queryKey) return { shifts: undefined, error: null };
  return { shifts: result.shifts, error: result.error };
}
