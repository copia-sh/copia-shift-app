import { useState } from "react";
import type { User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { createGroup, joinGroup } from "../firebase/groups";
import { signOut } from "../firebase/auth";
import { FIELD, PRIMARY_BUTTON } from "./ui/controls";

interface GroupSetupProps {
  user: User;
  onDone: () => void;
}

export function GroupSetup({ user, onDone }: GroupSetupProps) {
  // 招待リンク（?g=...）から開かれたときは参加タブを最初に見せる
  const [mode, setMode] = useState<"create" | "join">(() =>
    new URLSearchParams(window.location.search).get("g") ? "join" : "create",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">グループの管理</h1>
      <div className="w-full max-w-xs">
        <div className="mb-4 rounded-lg border border-brand-line bg-brand-wash px-3 py-2.5 text-left">
          <p className="text-[11px] font-bold text-brand-deep">ログイン中のアカウント</p>
          <p className="mt-0.5 truncate text-sm text-ink" title={user.email ?? ""}>
            {user.email}
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            disabled={busy}
            className="mt-2 text-[12px] font-bold text-brand-deep hover:underline disabled:opacity-50"
          >
            別のアカウントでログイン
          </button>
        </div>
        <div className="mb-4 flex overflow-hidden rounded-md border border-line-strong">
          <button
            type="button"
            onClick={() => {
              setMode("create");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-sm ${
              mode === "create" ? "bg-brand text-white" : "text-ink-3"
            }`}
          >
            グループを作る
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("join");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-sm ${
              mode === "join" ? "bg-brand text-white" : "text-ink-3"
            }`}
          >
            招待リンクで参加
          </button>
        </div>

        {mode === "create" ? (
          <CreateGroupForm user={user} onDone={onDone} busy={busy} setBusy={setBusy} error={error} setError={setError} />
        ) : (
          <JoinGroupForm user={user} onDone={onDone} busy={busy} setBusy={setBusy} error={error} setError={setError} />
        )}
      </div>
    </div>
  );
}

function CreateGroupForm({
  user,
  onDone,
  busy,
  setBusy,
  error,
  setError,
}: {
  user: User;
  onDone: () => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createGroup({
        name: groupName,
        ownerUid: user.uid,
        ownerEmail: user.email!,
        inviteCode,
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 text-left">
      <input
        type="text"
        required
        placeholder="グループ名"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        className={FIELD}
        disabled={busy}
      />
      <input
        type="text"
        required
        minLength={6}
        placeholder="招待コード(6文字以上)"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        className={FIELD}
        disabled={busy}
      />
      {error && <p className="text-xs text-danger-text">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className={PRIMARY_BUTTON}
      >
        グループを作成
      </button>
    </form>
  );
}

function JoinGroupForm({
  user,
  onDone,
  busy,
  setBusy,
  error,
  setError,
}: {
  user: User;
  onDone: () => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const groupIdFromUrl = params.get("g");
  const [groupId, setGroupId] = useState(groupIdFromUrl ?? "");
  const [inviteCode, setInviteCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await joinGroup({
        groupId,
        uid: user.uid,
        email: user.email!,
        inviteCode,
      });
      onDone();
    } catch {
      setError("招待コードかグループIDが正しくありません");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 text-left">
      {groupIdFromUrl ? (
        <div className="rounded-md border border-line-strong px-3 py-2 text-sm bg-line-3 text-ink-2">
          {groupId}
        </div>
      ) : (
        <input
          type="text"
          required
          placeholder="グループID"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className={FIELD}
          disabled={busy}
        />
      )}
      <input
        type="text"
        required
        minLength={6}
        placeholder="招待コード(6文字以上)"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        className={FIELD}
        disabled={busy}
      />
      {error && <p className="text-xs text-danger-text">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className={PRIMARY_BUTTON}
      >
        参加する
      </button>
    </form>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    return "グループの作成に失敗しました。もう一度お試しください。";
  }
  return "エラーが発生しました。もう一度お試しください。";
}
