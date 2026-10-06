import type { DetailItem } from "./taskDetailParts";

/** 詳細パネル・シートで共有する見た目の定数（コンポーネントのファイルから分けて Fast Refresh を保つ）。 */
export const LABEL = "text-[11px] font-bold text-ink-4";
export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md bg-brand px-3.5 text-[13px] font-bold text-white shadow-[0_2px_0_0_var(--color-brand-deep)]";
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-line bg-white px-3 text-[13px] font-bold text-ink-2 shadow-[0_2px_0_0_var(--color-edge)]";

export function eyebrow(item: DetailItem): string {
  return item.kind === "task" ? `タスク No.${item.no}` : "定例業務";
}
