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
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (disposed || document.hidden) {
        return;
      }

      timer = setTimeout(async () => {
        timer = null;
        if (disposed || document.hidden || inFlightRef.current) {
          schedule();
          return;
        }

        inFlightRef.current = true;
        try {
          await callbackRef.current();
        } finally {
          inFlightRef.current = false;
          schedule();
        }
      }, intervalMs);
    };

    const runNow = () => {
      if (disposed || document.hidden || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      clearTimer();
      void Promise.resolve(callbackRef.current())
        .finally(() => {
          inFlightRef.current = false;
          schedule();
        });
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else {
        runNow();
      }
    };

    if (!document.hidden) {
      schedule();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
