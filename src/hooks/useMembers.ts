import { useEffect, useState } from "react";
import { subscribeToMembers } from "../firebase/members";
import type { Member } from "../types";

/**
 * `enabled` should be false until a user is actually signed in. Opening the
 * Firestore listen stream before sign-in and then signing in moments later
 * can leave that stream's auth context stale, which made the very first
 * write right after sign-up/join intermittently fail. Only subscribing once
 * a signed-in user exists avoids the race entirely.
 */
export function useMembers(enabled: boolean, refreshKey = 0) {
  const [members, setMembers] = useState<Member[] | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setMembers(undefined);
      return;
    }
    return subscribeToMembers(setMembers);
    // refreshKey deliberately re-runs this effect to open a brand new listen
    // stream. Firestore watch streams that get rejected once (e.g. right
    // after joining a team, before the member doc existed) don't retry on
    // their own once the underlying data changes, so a fresh subscription is
    // needed immediately after a member is created.
  }, [enabled, refreshKey]);

  return members; // undefined = loading (or not yet enabled)
}
