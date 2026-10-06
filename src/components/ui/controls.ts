/**
 * 画面をまたいで同じ見た目になる部品のクラス文字列。
 *
 * 同じ見た目を別々の場所で書き直すと、片方だけ直したときに静かにずれていく。
 * 2か所以上で同じ姿になるものはここに置き、各画面からは参照するだけにする。
 * 幅や余白の違いは `${FIELD} w-full` のように足して表す。
 *
 * 色はここにも直接書かず、src/index.css の @theme のトークン名で書く（docs/design-tokens.md）。
 */

/** ダイアログの背面。クリックで閉じる層も兼ねる。 */
export const MODAL_BACKDROP = "fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4";

/** 入力欄の枠。幅は使う側で足す。 */
export const FIELD = "rounded-md border border-line-strong px-3 py-2 text-sm";

/** 入力欄の見出し。 */
export const FIELD_LABEL = "block text-sm font-bold text-ink-2 mb-1";

/** チェックボックス・ラジオ。 */
export const CHECKBOX = "h-4 w-4 border-line-strong text-brand focus:ring-brand";

/** ダイアログ下部の主ボタン（実行）と副ボタン（取消）。横に並べる前提で flex-1 を持つ。 */
export const DIALOG_PRIMARY =
  "flex-1 px-4 py-2 text-[12px] font-bold border border-brand rounded bg-brand text-white hover:bg-brand-press disabled:opacity-50 disabled:cursor-not-allowed";
export const DIALOG_SECONDARY =
  "flex-1 px-4 py-2 text-[12px] font-bold border border-line-strong rounded bg-white text-ink-2 hover:bg-surface-4 disabled:opacity-50 disabled:cursor-not-allowed";

/** 単独で置く主ボタン（ログイン・グループ作成など）。 */
export const PRIMARY_BUTTON =
  "mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-press disabled:opacity-50";

/** 絞り込みのチップ。選択中と未選択。 */
export const CHIP_ON = "border-brand bg-brand-tint text-brand-deep";
export const CHIP_OFF = "border-line bg-white text-ink-2 hover:bg-surface-4";

/** 入力の下に出すエラー文。 */
export const FIELD_ERROR = "mt-2 text-xs font-medium text-danger-text";
