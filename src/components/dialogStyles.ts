const BUTTON_BASE =
  "h-[38px] flex-1 rounded-md px-4 text-[13px] font-bold active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:shadow-none";

/** ダイアログ・シートのボタン。主＝青、破壊的＝コーラル、副＝白で統一する。 */
export function dialogButtonClass(tone: "primary" | "danger" | "secondary"): string {
  if (tone === "primary") {
    return `${BUTTON_BASE} border border-[#248DD4] bg-[#248DD4] text-white shadow-[0_2px_0_0_#0863A0]`;
  }
  if (tone === "danger") {
    return `${BUTTON_BASE} border border-[#D9736F] bg-[#D9736F] text-white shadow-[0_2px_0_0_#B0413E]`;
  }
  return `${BUTTON_BASE} border border-[#E5E7EB] bg-white text-[#374151] shadow-[0_2px_0_0_#E3E3E3]`;
}
