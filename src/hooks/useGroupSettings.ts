import { useEffect, useState } from "react";
import type { GroupSettings } from "../types";
import { subscribeToGroupSettings } from "../firebase/settings";

export function useGroupSettings(groupId: string | null): GroupSettings | undefined {
  const [settings, setSettings] = useState<GroupSettings | undefined>(undefined);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToGroupSettings(groupId, setSettings);
  }, [groupId]);

  return settings;
}
