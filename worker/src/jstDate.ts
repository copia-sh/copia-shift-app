const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Shift.date は実質 Asia/Tokyo 基準の暦日。Cloudflare Workers はUTCで動くため、
 * date-fns の addDays/format (実行環境のローカルタイムゾーン依存)は使わず、
 * UTCエポックの計算だけで実行環境に依存しないJST日付キーを作る。
 */
export function toJstDateKey(instant: Date): string {
  const jst = new Date(instant.getTime() + JST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}
