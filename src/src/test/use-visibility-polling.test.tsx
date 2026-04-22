import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVisibilityPolling } from "../ui/hooks/useVisibilityPolling";

function setHidden(value: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value,
  });
}

describe("useVisibilityPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("does not schedule polling when disabled or the interval is invalid", () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityPolling(callback, 0, true));
    renderHook(() => useVisibilityPolling(callback, 100, false));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("polls while visible and pauses while hidden", async () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityPolling(callback, 100, true));

    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(200);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("avoids overlapping async callbacks and resumes afterwards", async () => {
    let resolveCurrent: (() => void) | null = null;
    const callback = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCurrent = resolve;
        }),
    );

    renderHook(() => useVisibilityPolling(callback, 100, true));

    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCurrent?.();
      await Promise.resolve();
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("does not invoke the timer callback when the document becomes hidden before it fires", async () => {
    const callback = vi.fn();

    renderHook(() => useVisibilityPolling(callback, 100, true));

    act(() => {
      setHidden(true);
      vi.advanceTimersByTime(100);
    });

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores visibility resumes while an async callback is already in flight", async () => {
    let resolveCurrent: (() => void) | null = null;
    const callback = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCurrent = resolve;
        }),
    );

    setHidden(true);
    renderHook(() => useVisibilityPolling(callback, 100, true));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCurrent?.();
      await Promise.resolve();
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });
});