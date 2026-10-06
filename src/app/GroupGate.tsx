import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { GroupSetup } from "../components/GroupSetup";
import { FullScreenMessage, LoadingScreen } from "../components/FullScreenMessage";
import { useMembers } from "../hooks/useMembers";
import { useMyGroupIds } from "../hooks/useMyGroupIds";
import { useGroups } from "../hooks/useGroups";
import { signOut } from "../firebase/auth";
import type { Group, Member } from "../types";

const GROUP_STORAGE_KEY = "copia-shift:groupId";

/** localStorage はプライベートブラウズ等で例外を投げうるので、失敗しても無視する。 */
function readStoredGroupId(): string | null {
  try {
    return localStorage.getItem(GROUP_STORAGE_KEY);
  } catch {
    return null;
  }
}
function storeGroupId(id: string) {
  try {
    localStorage.setItem(GROUP_STORAGE_KEY, id);
  } catch {
    /* 保存できなくても動作に影響はない */
  }
}

/** 解決できたグループと、その中での自分。ここまで揃ってはじめて本編を描ける。 */
export interface ResolvedGroup {
  groupId: string;
  groups: Group[];
  members: Member[];
  currentMember: Member;
  onChangeGroup: (id: string) => void;
  onCreateNewGroup: () => void;
}

/**
 * ログイン済みユーザーを、所属グループとその中のメンバー情報に解決する。
 * currentMember は必ず Firestore 上の実データから引く（role や active を
 * 権限判定に使うため、認証情報から組み立てた偽物を渡してはいけない）。
 */
export function GroupGate({
  user,
  children,
}: {
  user: User;
  children: (resolved: ResolvedGroup) => React.ReactNode;
}) {
  const groupIds = useMyGroupIds(user.uid);
  const groups = useGroups(groupIds);
  // 「ユーザーが明示的に選んだグループ」だけを state に持つ。実際に表示する
  // グループは groupIds から毎レンダー導出する（effect で state を書き戻すと、
  // 再購読のたびに画面が一瞬 undefined に落ちてフォームが失われる）。
  const [pickedGroupId, setPickedGroupId] = useState<string | null>(readStoredGroupId);
  const [showSetup, setShowSetup] = useState(false);

  const groupId =
    pickedGroupId && groupIds?.includes(pickedGroupId) ? pickedGroupId : (groupIds?.[0] ?? null);

  useEffect(() => {
    if (groupId) storeGroupId(groupId);
  }, [groupId]);

  const members = useMembers(groupId);

  if (!groupIds) {
    return <LoadingScreen />;
  }

  if (groupIds.length === 0 || showSetup) {
    return <GroupSetup user={user} onDone={() => setShowSetup(false)} />;
  }

  if (!groupId || !groups || !members) {
    return <LoadingScreen />;
  }

  const currentMember = members.find((m) => m.id === user.uid);
  if (!currentMember) {
    return (
      <FullScreenMessage
        title="このグループのメンバー情報が見つかりません"
        action={
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md px-4 py-2 text-sm font-bold text-ink-4 hover:bg-line-3"
          >
            ログアウト
          </button>
        }
      />
    );
  }

  return (
    <>
      {children({
        groupId,
        groups,
        members,
        currentMember,
        onChangeGroup: setPickedGroupId,
        onCreateNewGroup: () => setShowSetup(true),
      })}
    </>
  );
}
