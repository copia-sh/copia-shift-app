import { useCallback, useEffect, useState } from "react";
import { hashForScreen, screenFromHash, type Screen } from "./screen";

export function useScreen(): [Screen, (next: Screen) => void] {
  const [screen, setScreen] = useState<Screen>(() => screenFromHash(window.location.hash));

  useEffect(() => {
    const sync = () => setScreen(screenFromHash(window.location.hash));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const change = useCallback((next: Screen) => {
    if (screenFromHash(window.location.hash) === next) return;
    // 招待リンクの ?g= などのクエリは残し、ハッシュだけ替える。履歴に積んで「戻る」で前の画面へ戻れるようにする。
    const { pathname, search } = window.location;
    window.history.pushState(null, "", `${pathname}${search}${hashForScreen(next)}`);
    setScreen(next);
  }, []);

  return [screen, change];
}
