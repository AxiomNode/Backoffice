import { useEffect, useRef } from "react";

/** Schedules auto-refresh work without forcing parent rerenders on every second tick. */
export function useAutoRefreshScheduler(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
  paused = false,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || paused || intervalMs <= 0) {
      return;
    }

    let timer: ReturnType<typeof window.setTimeout> | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (document.hidden) {
        return;
      }

      timer = window.setTimeout(() => {
        timer = null;
        void callbackRef.current();
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
        return;
      }

      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, paused, intervalMs]);
}