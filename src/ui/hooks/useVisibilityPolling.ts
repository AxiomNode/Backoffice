import { useEffect, useRef } from "react";

/** @module useVisibilityPolling - Polling hook that pauses when the browser tab is hidden. */

/**
 * Runs a callback on a fixed interval, automatically pausing when
 * the browser tab is hidden (Page Visibility API) and resuming on return.
 *
 * @param callback  Async or sync function to invoke periodically.
 * @param intervalMs  Polling period in milliseconds.
 * @param enabled  Set to `false` to fully disable polling.
 */
export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        void callbackRef.current();
      }, intervalMs);
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) {
      start();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
