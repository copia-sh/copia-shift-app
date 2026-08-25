import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Group } from "../types";

const toMillis = (value: unknown) =>
  value ? (value as { toMillis(): number }).toMillis() : null;

/**
 * 所属している各グループのメタ情報を購読する。読めないグループは黙って除外する。
 *
 * 依存は groupIds の中身を連結したキーにしている。呼び出し元の
 * `subscribeToMyGroupIds` はスナップショットごとに新しい配列を返すため、
 * 配列そのものを依存にすると中身が同じでも購読を張り直してしまう。
 */
export function useGroups(groupIds: string[] | undefined): Group[] | undefined {
  const [groups, setGroups] = useState<Group[] | undefined>(undefined);
  const key = groupIds?.join(",");

  useEffect(() => {
    // 未確定（undefined）と「所属ゼロ」（空文字）はどちらも購読しない。
    // どちらの戻り値もレンダー中に導出するので、ここで setState はしない。
    if (!key) return;

    const ids = key.split(",");

    // 各グループの最新値をここに溜め、スナップショットが来るたびに
    // 現時点で読めているものだけを groupIds の順で組み直す。
    // 「全件揃うまで待つ」形にすると、初回以降の更新（グループ名の変更など）を
    // 取りこぼすので、毎回そのまま反映する。
    const latest = new Map<string, Group>();
    let cancelled = false;

    const publish = () => {
      if (cancelled) return;
      setGroups(ids.map((id) => latest.get(id)).filter((g): g is Group => g !== undefined));
    };

    const unsubscribers = ids.map((groupId) =>
      onSnapshot(
        doc(db, "groups", groupId),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            latest.set(groupId, {
              id: snapshot.id,
              name: data.name as string,
              ownerId: data.ownerId as string,
              createdAt: toMillis(data.createdAt),
            });
          } else {
            latest.delete(groupId);
          }
          publish();
        },
        () => {
          // 読めない（ルールで拒否された）グループは一覧から外すだけにする
          latest.delete(groupId);
          publish();
        },
      ),
    );

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [key]);

  if (groupIds === undefined) return undefined;
  if (groupIds.length === 0) return [];
  return groups;
}
