import { useEffect, useState } from "react";
import { subscribeToMyShareLinks } from "../firebase/shareLinks";
import type { ShareLink } from "../types";

export function useMyShareLinks(groupId: string | null, memberId: string | null) {
  const queryKey = groupId && memberId ? `${groupId}:${memberId}` : "";
  const [result, setResult] = useState<{ queryKey: string; links: ShareLink[] } | null>(null);

  useEffect(() => {
    if (!groupId || !memberId) return;
    return subscribeToMyShareLinks(groupId, memberId, (links) => {
      setResult({ queryKey, links });
    });
  }, [groupId, memberId, queryKey]);

  return result?.queryKey === queryKey ? result.links : undefined;
}
