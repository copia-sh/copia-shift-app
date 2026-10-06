/** 選択中を色以外でも示す小さな ✓ バッジ（赤は使わず前景色を流用） */
export function SelectedBadge({ fg }: { fg: string }) {
  return (
    <span
      className="pointer-events-none absolute right-[1px] top-[1px] text-[8px] font-bold leading-none"
      style={{ color: fg }}
      aria-hidden
    >
      ✓
    </span>
  );
}

