/** @module sessionStorage - Utilities for cleaning up prefixed localStorage entries on logout. */

/** Removes all localStorage entries whose keys match any of the given prefixes. */
export function clearPrefixedStorageEntries(prefixes: string[], storage?: Storage): number {
  if (!storage || prefixes.length === 0) {
    return 0;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }

    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
  return keysToRemove.length;
}
