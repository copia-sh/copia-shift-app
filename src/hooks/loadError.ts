/**
 * 読み込み失敗を利用者向けの1文にする。
 *
 * 失敗を握り潰すと「読み込み中…」のまま止まり、権限の問題なのか通信なのかが
 * 分からない。再読み込みで直るかどうかが変わるので、原因で文を分ける。
 */
export function describeLoadError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? String(error);
  if (code.includes("permission-denied")) {
    return "読み込む権限がありません。グループの在籍状態を確認してください。";
  }
  return "読み込めませんでした。通信状況を確認してください。";
}
