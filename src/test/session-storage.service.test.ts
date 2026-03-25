import { describe, expect, it } from "vitest";

import { clearPrefixedStorageEntries } from "../application/services/sessionStorage";

describe("clearPrefixedStorageEntries", () => {
  it("removes only keys matching configured prefixes", () => {
    window.localStorage.clear();
    window.localStorage.setItem("backoffice.serviceRouteQuery.svc-api-gateway", "x=1");
    window.localStorage.setItem("backoffice.serviceLastError.svc-users", "err");
    window.localStorage.setItem("backoffice.uiTheme", "dark");

    const removed = clearPrefixedStorageEntries(
      ["backoffice.serviceRouteQuery.", "backoffice.serviceLastError."],
      window.localStorage,
    );

    expect(removed).toBe(2);
    expect(window.localStorage.getItem("backoffice.serviceRouteQuery.svc-api-gateway")).toBeNull();
    expect(window.localStorage.getItem("backoffice.serviceLastError.svc-users")).toBeNull();
    expect(window.localStorage.getItem("backoffice.uiTheme")).toBe("dark");
  });

  it("returns 0 when storage is not provided", () => {
    const removed = clearPrefixedStorageEntries(["prefix."], undefined);
    expect(removed).toBe(0);
  });
});
