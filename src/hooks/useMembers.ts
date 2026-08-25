import { useEffect, useState } from "react";
import { subscribeToMembers } from "../firebase/members";
import type { Member } from "../types";

export function useMembers(groupId: string | null, refreshKey = 0) {
  const [members, setMembers] = useState<Member[] | undefined>(undefined);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToMembers(groupId, setMembers);
  }, [groupId, refreshKey]);

  return members;
}
