import { useEffect, useState } from "react";

/** Tailwind の `md`（768px）以上か。PC のパネルとスマホのシートを、CSS で隠すのではなく描き分けるために使う。 */
export function useIsDesktop(): boolean {
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return matches;
}
