import { useEffect, useState } from "react";
import { subscribeToMembers } from "../firebase/members";
import type { Member } from "../types";

export function useMembers() {
  const [members, setMembers] = useState<Member[] | undefined>(undefined);

  useEffect(() => {
    return subscribeToMembers(setMembers);
  }, []);

  return members; // undefined = loading
}
