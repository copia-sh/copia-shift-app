import { useEffect, useState } from "react";

/**
 * 詳細を右パネルで出せる幅か。1024px 未満では、右に360pxを置くと
 * カレンダー側が読めなくなるのでシートへ切り替える。
 */
export function useIsNarrowViewport(maxWidth = 1023): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return narrow;
}
