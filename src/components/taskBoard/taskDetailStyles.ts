import type { DetailItem } from "./taskDetailParts";

/** 詳細パネル・シートで共有する見た目の定数（コンポーネントのファイルから分けて Fast Refresh を保つ）。 */
export const LABEL = "text-[11px] font-bold text-[#6B7280]";
export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md bg-[#248DD4] px-3.5 text-[13px] font-bold text-white shadow-[0_2px_0_0_#0863A0]";
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-[#E5E7EB] bg-white px-3 text-[13px] font-bold text-[#374151] shadow-[0_2px_0_0_#E3E3E3]";

export function eyebrow(item: DetailItem): string {
  return item.kind === "task" ? `タスク No.${item.no}` : "定例業務";
}
