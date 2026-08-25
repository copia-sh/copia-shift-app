import { useState } from "react";
import type { User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { signInWithEmail, signUpWithEmail } from "../firebase/auth";

/**
 * 認証だけを担当する。ログイン済みのユーザーが「どのグループのどのメンバーか」の
 * 解決は App 側の責任にしている（グループを跨げるようになったため、認証の時点では
 * まだメンバーが確定しない）。
 */
interface LoginGateProps {
  user: User | null | undefined;
  children: (currentUser: User) => React.ReactNode;
}

export function LoginGate({ user, children }: LoginGateProps) {
  if (user === undefined) {
    return <FullScreenMessage title="読み込み中..." />;
  }

  if (user === null) {
    return <AuthForm />;
  }

  return <>{children(user)}</>;
}

function FullScreenMessage({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      {children}
    </div>
  );
}

function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "このメールアドレスは既に登録されています。ログインをお試しください。";
      case "auth/invalid-email":
        return "メールアドレスの形式が正しくありません。";
      case "auth/weak-password":
        return "パスワードは6文字以上にしてください。";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "メールアドレスまたはパスワードが正しくありません。";
      default:
        return `エラーが発生しました(${error.code})`;
    }
  }
  return "エラーが発生しました。もう一度お試しください。";
}

function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullScreenMessage title="Copia シフト管理">
      <div className="w-full max-w-xs">
        <div className="mb-4 flex overflow-hidden rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 py-1.5 text-sm ${
              mode === "signin" ? "bg-blue-600 text-white" : "text-gray-600"
            }`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-1.5 text-sm ${
              mode === "signup" ? "bg-blue-600 text-white" : "text-gray-600"
            }`}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 text-left">
          <input
            type="email"
            required
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="パスワード(6文字以上)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mode === "signup" ? "登録する" : "ログイン"}
          </button>
        </form>
      </div>
    </FullScreenMessage>
  );
}
