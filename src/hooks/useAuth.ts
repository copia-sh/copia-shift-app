import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { subscribeToAuthState } from "../firebase/auth";

export function useAuthUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return subscribeToAuthState(setUser);
  }, []);

  return user; // undefined = loading, null = signed out
}
