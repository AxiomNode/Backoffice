import { useEffect, useState } from "react";

/** @module useDebouncedValue - Delays propagating rapidly changing values. */

/** Returns a debounced copy of a value to avoid issuing work on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, value]);

  return debouncedValue;
}