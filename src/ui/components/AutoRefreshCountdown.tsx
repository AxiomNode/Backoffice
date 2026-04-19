import { memo, useEffect, useState } from "react";

type AutoRefreshCountdownProps = {
  active: boolean;
  loading: boolean;
  intervalSeconds: number;
  cycleVersion: number;
  compact: boolean;
  updatingLabel: string;
  getNextSyncLabel: (seconds: string) => string;
};

/** Lightweight auto-refresh indicator isolated from the heavy parent panels. */
export const AutoRefreshCountdown = memo(function AutoRefreshCountdown({
  active,
  loading,
  intervalSeconds,
  cycleVersion,
  compact,
  updatingLabel,
  getNextSyncLabel,
}: AutoRefreshCountdownProps) {
  const cycleMs = Math.max(1, intervalSeconds * 1000);
  const [remainingMs, setRemainingMs] = useState(cycleMs);

  useEffect(() => {
    setRemainingMs(cycleMs);
  }, [active, loading, cycleMs, cycleVersion]);

  useEffect(() => {
    if (!active || loading) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active, loading]);

  const progressPercent = Math.min(100, ((cycleMs - remainingMs) / cycleMs) * 100);
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000)).toString();
  const progressHeight = compact ? "h-1.5" : "h-2";
  const labelClass = compact ? "text-[11px]" : "text-xs";

  return (
    <div className="mt-3 space-y-2">
      <div className={`${progressHeight} w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]`}>
        <div
          className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width] duration-150"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
        />
      </div>
      <p className={`${labelClass} text-[var(--md-sys-color-on-surface-variant)]`}>
        {loading ? updatingLabel : getNextSyncLabel(remainingSeconds)}
      </p>
    </div>
  );
});