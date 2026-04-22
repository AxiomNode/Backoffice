import { useEffect, useState } from "react";

/** Returns true while the window width is at or below the provided threshold. */
export function useMaxWidth(maxWidth: number): boolean {
  const readMatch = () => (typeof window !== "undefined" ? window.innerWidth <= maxWidth : false);
  const [matches, setMatches] = useState<boolean>(readMatch);

  useEffect(() => {
    const updateMatch = () => setMatches(readMatch());

    updateMatch();
    window.addEventListener("resize", updateMatch);
    return () => window.removeEventListener("resize", updateMatch);
  }, [maxWidth]);

  return matches;
}