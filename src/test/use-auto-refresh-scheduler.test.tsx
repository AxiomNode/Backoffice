import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoRefreshScheduler } from "../ui/hooks/useAutoRefreshScheduler";

function Probe({
  callback,
  intervalMs,
  enabled,
  paused = false,
}: {
  callback: () => void;
  intervalMs: number;
  enabled: boolean;
  paused?: boolean;
}) {
  useAutoRefreshScheduler(callback, intervalMs, enabled, paused);
  return null;
}

describe("useAutoRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the callback on schedule and stops once unmounted", () => {
    const callback = vi.fn();
    const { unmount } = render(<Probe callback={callback} intervalMs={1000} enabled paused={false} />);

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not schedule work while disabled, paused or hidden and resumes on visibility change", () => {
    const callback = vi.fn();
    const { rerender } = render(<Probe callback={callback} intervalMs={1000} enabled={false} paused={false} />);

    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();

    rerender(<Probe callback={callback} intervalMs={1000} enabled paused />);
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    rerender(<Probe callback={callback} intervalMs={1000} enabled paused={false} />);
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("skips scheduling when the interval is not positive", () => {
    const callback = vi.fn();
    render(<Probe callback={callback} intervalMs={0} enabled paused={false} />);

    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });
});