import { useState } from "react";
import type { User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { signInWithEmail, signOut, signUpWithEmail } from "../firebase/auth";
import { createMemberProfile } from "../firebase/members";
import type { Member } from "../types";

interface LoginGateProps {
  user: User | null | undefined;
  members: Member[] | undefined;
  children: (currentUser: User, currentMember: Member) => React.ReactNode;
}

export function LoginGate({ user, members, children }: LoginGateProps) {
  if (user === undefined || members === undefined) {
    return <FullScreenMessage title="読み込み中..." />;
  }

  if (user === null) {
    return <AuthForm />;
  }

  const currentMember = members.find(
    (m) => m.email.toLowerCase() === user.email?.toLowerCase(),
  );

  if (!currentMember) {
    return <JoinTeamForm user={user} />;
  }

  return <>{children(user, currentMember)}</>;
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

function JoinTeamForm({ user }: { user: User }) {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createMemberProfile({ email: user.email!, inviteCode });
    } catch {
      setError("招待コードが正しくありません。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullScreenMessage title="チームに参加">
      <p className="mb-2 text-sm text-gray-600">{user.email}</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-2">
        <input
          type="text"
          required
          placeholder="招待コード"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          参加する
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-2 text-xs text-gray-400 hover:underline"
        >
          ログアウト
        </button>
      </form>
    </FullScreenMessage>
  );
}
