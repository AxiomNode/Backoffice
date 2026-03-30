import { useCallback, useEffect, useState } from "react";

import type { NavKey } from "../../domain/types/backoffice";

function navKeyFromHash(hash: string, allowed: NavKey[]): NavKey | null {
  const match = hash.match(/^#\/backoffice\/([^/?#]+)/);
  if (!match) return null;
  const candidate = match[1] as NavKey;
  return allowed.includes(candidate) ? candidate : null;
}

export function routeFromNavKey(key: NavKey): string {
  return `#/backoffice/${key}`;
}

/**
 * Manages hash-based routing for the backoffice shell.
 * Returns the current NavKey and a navigate function that updates the hash.
 */
export function useHashRoute(
  allowedKeys: NavKey[],
  fallback: NavKey,
): [current: NavKey, navigate: (key: NavKey) => void] {
  const [current, setCurrent] = useState<NavKey>(() => {
    if (typeof window === "undefined") return fallback;
    return navKeyFromHash(window.location.hash, allowedKeys) ?? fallback;
  });

  useEffect(() => {
    if (!allowedKeys.includes(current)) {
      setCurrent(allowedKeys[0] ?? fallback);
    }
  }, [allowedKeys, current, fallback]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const fromHash = navKeyFromHash(window.location.hash, allowedKeys);
    if (fromHash && fromHash !== current) {
      setCurrent(fromHash);
    }

    const onHashChange = () => {
      const next = navKeyFromHash(window.location.hash, allowedKeys);
      if (next) setCurrent(next);
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [allowedKeys, current]);

  const navigate = useCallback(
    (key: NavKey) => {
      if (typeof window !== "undefined") {
        const route = routeFromNavKey(key);
        if (window.location.hash !== route) {
          window.location.hash = route;
        }
      }
      setCurrent(key);
    },
    [],
  );

  return [current, navigate];
}
