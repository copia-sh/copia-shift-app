import { FirebaseError } from "firebase/app";

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

/**
 * 書き込み失敗を利用者向けの1文にする。
 *
 * セキュリティルールに拒否された操作を握り潰すと、画面上は何も起きなかったように
 * 見える。権限の問題か、それ以外かで、利用者が次に取る行動が変わる。
 * 操作によって補足したいことが違うので、文面だけ差し替えられるようにしている。
 */
export function describeWriteError(
  err: unknown,
  message: { denied?: string; failed?: string } = {},
): string {
  const denied =
    err instanceof FirebaseError
      ? err.code === "permission-denied"
      : String(err).includes("permission-denied");
  return denied
    ? (message.denied ?? "この操作を行う権限がありません")
    : (message.failed ?? "操作に失敗しました。もう一度お試しください。");
}
