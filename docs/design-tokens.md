# 配色トークン

色の定義は **src/index.css の `@theme` だけ**。コンポーネントに `#248DD4` のような生の色や、
Tailwind 既定の `gray-200` / `blue-600` を書かない。`tests/palette.test.ts` が
`src/theme/palette.ts` と index.css の一致、およびトークン同士の値の重複を検証している。

使い方: `bg-brand` / `text-ink-4` / `border-line` / `shadow-[0_2px_0_0_var(--color-edge)]`。

## 置き換え表（旧い書き方 → トークン）

| 旧 | トークン | 値 |
|---|---|---|
| `#248DD4` / `bg-blue-600` | `brand` | #248DD4 |
| `#0863A0` | `brand-deep` | #0863A0 |
| `#1B6FA8` / `hover:bg-blue-700` | `brand-press` | #1B6FA8 |
| `#A7D1EE` / `border-blue-200` | `brand-line` | #A7D1EE |
| `#D1E9F9` / `hover:bg-blue-100` | `brand-tint` | #D1E9F9 |
| `#EDF6FD` / `bg-blue-50` | `brand-wash` | #EDF6FD |
| `#1F8A98` | `teal` | #1F8A98 |
| `#166A75` | `teal-deep` | #166A75 |
| `#A5D0D6` | `teal-line` | #A5D0D6 |
| `#E0F0F2` | `teal-wash` | #E0F0F2 |
| `#D9736F` | `coral` | #D9736F |
| `#A8433F` | `coral-deep` | #A8433F |
| `#F0C7C7` | `coral-line` | #F0C7C7 |
| `#FDF1F1` | `coral-wash` | #FDF1F1 |
| `#E08A2E` | `orange` | #E08A2E |
| `#8A5310` | `orange-deep` | #8A5310 |
| `#F3D0AB` | `orange-line` | #F3D0AB |
| `#FBEEDF` | `orange-wash` | #FBEEDF |
| `#F9E428` | `today` | #F9E428 |
| `#FFF6D6` | `today-wash` | #FFF6D6 |
| `#FFFBEA` | `today-wash-2` | #FFFBEA |
| `#FFFDF4` | `today-wash-3` | #FFFDF4 |
| `#111827` / `text-gray-900` / `text-gray-800` | `ink` | #111827 |
| `#374151` / `text-gray-700` | `ink-2` | #374151 |
| `#4B5563` / `text-gray-600` | `ink-3` | #4B5563 |
| `#6B7280` / `text-gray-500` | `ink-4` | #6B7280 |
| `#9CA3AF` / `text-gray-400` | `ink-5` | #9CA3AF |
| `#C8CDD2` | `ink-none` | #C8CDD2 |
| `border-gray-300` | `line-strong` | #D1D5DB |
| `#E5E7EB` / `border-gray-200` | `line` | #E5E7EB |
| `#EFF1F3` | `line-2` | #EFF1F3 |
| `#F1F3F5` / `gray-100` | `line-3` | #F1F3F5 |
| `#F4F6F8` | `line-4` | #F4F6F8 |
| `#E3E3E3` | `edge` | #E3E3E3 |
| `#F0F0F0` | `edge-hover` | #F0F0F0 |
| `#F7F9FB` | `page` | #F7F9FB |
| `#FFFFFF` | `surface`（`bg-white` のままでも可） | #FFFFFF |
| `#FBFCFD` | `surface-2` | #FBFCFD |
| `#FAFBFC` | `surface-3` | #FAFBFC |
| `#F9FAFB` / `bg-gray-50` | `surface-4` | #F9FAFB |
| `#EF4444` | `danger` | #EF4444 |
| `text-red-600` | `danger-text` | #DC2626 |
| `#B91C1C` / `text-red-700` | `danger-deep` | #B91C1C |
| `#FECACA` / `border-red-200` | `danger-line` | #FECACA |
| `#FEF2F2` / `bg-red-50` | `danger-wash` | #FEF2F2 |

Tailwind 既定の `gray-*` は v4 で OKLCH 表記になっているが、値は上の16進と同じ色。
`blue-600/700` だけは別系統の青（#2563eb）だったので、ブランド青 `brand` に寄せている。
