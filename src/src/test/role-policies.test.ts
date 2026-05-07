import { describe, expect, it } from "vitest";

import {
  navItemsForRole,
  roleCanInspectAll,
  roleCanManageUsers,
  roleCanModify,
  roleCanViewUserRoles,
  roleHasBackofficeAccess,
} from "../application/services/rolePolicies";

describe("role policies", () => {
  it("evaluates access capabilities by role", () => {
    expect(roleCanManageUsers("SuperAdmin")).toBe(true);
    expect(roleCanManageUsers("Admin")).toBe(false);
    expect(roleCanManageUsers("Inspector")).toBe(false);
    expect(roleCanViewUserRoles("Inspector")).toBe(true);

    expect(roleCanModify("SuperAdmin")).toBe(true);
    expect(roleCanModify("Admin")).toBe(true);
    expect(roleCanModify("Inspector")).toBe(false);
    expect(roleCanModify("Viewer")).toBe(false);
    expect(roleCanInspectAll("Inspector")).toBe(true);

    expect(roleHasBackofficeAccess("Inspector")).toBe(true);
    expect(roleHasBackofficeAccess("Viewer")).toBe(true);
    expect(roleHasBackofficeAccess("Gamer")).toBe(false);
  });

  it("builds navigation items according to the permitted feature set", () => {
    const adminItems = navItemsForRole("Admin");
    const inspectorItems = navItemsForRole("Inspector");
    const superAdminItems = navItemsForRole("SuperAdmin");

    expect(adminItems.some((item) => item.key === "svc-overview")).toBe(true);
    expect(adminItems.some((item) => item.key === "ai-diagnostics")).toBe(true);
    expect(adminItems.some((item) => item.key === "roles")).toBe(false);
    expect(adminItems.find((item) => item.key === "svc-api-gateway")?.section).toBe("platform");
    expect(adminItems.find((item) => item.key === "svc-wordpass")?.section).toBe("games");
    expect(adminItems.find((item) => item.key === "svc-ai-api")?.section).toBe("ai");

    expect(superAdminItems.some((item) => item.key === "roles")).toBe(true);
    expect(inspectorItems.some((item) => item.key === "roles")).toBe(true);
    expect(inspectorItems.some((item) => item.key === "ai-diagnostics")).toBe(true);
  });
});