import { useEffect, useState } from "react";
import { subscribeToShiftsInRange } from "../firebase/shifts";
import type { Shift } from "../types";

export interface ShiftsResult {
  /** 未取得のうちは undefined。読み込み失敗は error に入れ、0件と区別する */
  shifts: Shift[] | undefined;
  error: string | null;
}

function describeLoadError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? String(error);
  if (code.includes("permission-denied")) {
    return "シフトを読み込む権限がありません。グループの在籍状態を確認してください。";
  }
  return "シフトを読み込めませんでした。通信状況を確認してください。";
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
      (error) => setResult({ queryKey, shifts: [], error: describeLoadError(error) }),
    );
  }, [groupId, startDate, endDate, queryKey]);

  if (result?.queryKey !== queryKey) return { shifts: undefined, error: null };
  return { shifts: result.shifts, error: result.error };
}
