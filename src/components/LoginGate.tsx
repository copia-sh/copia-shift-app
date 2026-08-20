import type { User } from "firebase/auth";
import { signInWithGoogle, signOut } from "../firebase/auth";
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
    return (
      <FullScreenMessage title="Copia シフト管理">
        <button
          type="button"
          onClick={() => signInWithGoogle()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
        >
          Googleでログイン
        </button>
      </FullScreenMessage>
    );
  }

  const currentMember = members.find(
    (m) => m.email.toLowerCase() === user.email?.toLowerCase(),
  );

  if (!currentMember) {
    return (
      <FullScreenMessage title="アクセス権がありません">
        <p className="mb-4 text-gray-600">
          {user.email} はチームメンバーとして登録されていません。
          <br />
          管理者にFirestoreの members コレクションへの登録を依頼してください。
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          ログアウト
        </button>
      </FullScreenMessage>
    );
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
