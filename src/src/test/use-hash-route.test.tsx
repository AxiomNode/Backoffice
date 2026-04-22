import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { NavKey } from "../domain/types/backoffice";
import { routeFromNavKey, useHashRoute } from "../ui/hooks/useHashRoute";

describe("useHashRoute", () => {
  it("builds routes from navigation keys", () => {
    expect(routeFromNavKey("svc-overview")).toBe("#/backoffice/svc-overview");
  });

  it("falls back when the initial hash is invalid and reacts to hash changes", () => {
    window.location.hash = "#/backoffice/unknown";

    const { result } = renderHook(() => useHashRoute(["svc-overview", "svc-users"], "svc-overview"));

    expect(result.current[0]).toBe("svc-overview");

    act(() => {
      window.location.hash = "#/backoffice/svc-users";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(result.current[0]).toBe("svc-users");
  });

  it("falls back when the hash does not match the backoffice route pattern", () => {
    window.location.hash = "#/outside/svc-users";

    const { result } = renderHook(() => useHashRoute(["svc-overview", "svc-users"], "svc-overview"));

    expect(result.current[0]).toBe("svc-overview");
  });

  it("keeps the current key within the allowed set and updates the hash on navigate", () => {
    window.location.hash = "#/backoffice/svc-overview";

    const { result, rerender } = renderHook(
      ({ allowed, fallback }: { allowed: readonly NavKey[]; fallback: NavKey }) => useHashRoute(allowed, fallback),
      {
        initialProps: {
          allowed: ["svc-overview", "svc-users"] as readonly NavKey[],
          fallback: "svc-overview" as NavKey,
        },
      },
    );

    act(() => {
      result.current[1]("svc-users");
    });
    expect(window.location.hash).toBe("#/backoffice/svc-users");

    rerender({
      allowed: ["svc-overview"] as readonly NavKey[],
      fallback: "svc-overview" as NavKey,
    });

    expect(result.current[0]).toBe("svc-overview");
  });

  it("syncs from an already changed valid hash on rerender without waiting for a hashchange event", () => {
    window.location.hash = "#/backoffice/svc-overview";

    const { result, rerender } = renderHook(
      ({ allowed, fallback }: { allowed: readonly NavKey[]; fallback: NavKey }) => useHashRoute(allowed, fallback),
      {
        initialProps: {
          allowed: ["svc-overview", "svc-users"] as readonly NavKey[],
          fallback: "svc-overview" as NavKey,
        },
      },
    );

    expect(result.current[0]).toBe("svc-overview");

    window.location.hash = "#/backoffice/svc-users";
    rerender({
      allowed: ["svc-overview", "svc-users", "svc-api-gateway"] as readonly NavKey[],
      fallback: "svc-overview" as NavKey,
    });

    expect(result.current[0]).toBe("svc-users");
  });

  it("does not rewrite the location hash when navigating to the current route", () => {
    window.location.hash = "#/backoffice/svc-users";

    const { result } = renderHook(() => useHashRoute(["svc-overview", "svc-users"], "svc-overview"));

    act(() => {
      result.current[1]("svc-users");
    });

    expect(result.current[0]).toBe("svc-users");
    expect(window.location.hash).toBe("#/backoffice/svc-users");
  });
});