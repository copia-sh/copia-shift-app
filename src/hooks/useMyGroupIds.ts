import { useEffect, useState } from "react";
import { subscribeToMyGroupIds } from "../firebase/groups";

export function useMyGroupIds(uid: string | null) {
  const [groupIds, setGroupIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (!uid) return;
    return subscribeToMyGroupIds(uid, setGroupIds);
  }, [uid]);

  return groupIds;
}
