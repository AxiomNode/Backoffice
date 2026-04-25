import type { BackofficeRole, NavItem, NavSectionKey } from "../../domain/types/backoffice";
import { SERVICE_NAV_CONFIGS } from "../../domain/constants/navigation";

/** @module rolePolicies - RBAC policy helpers for navigation and feature gating. */

/** Returns true if the role can manage other users' roles (SuperAdmin only). */
export function roleCanManageUsers(role: BackofficeRole): boolean {
  return role === "SuperAdmin";
}

/** Returns true if the role can perform write operations (SuperAdmin or Admin). */
export function roleCanModify(role: BackofficeRole): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

/** Returns true if the role has any level of backoffice access. */
export function roleHasBackofficeAccess(role: BackofficeRole): boolean {
  return role !== "Gamer";
}

const SERVICE_SECTION_BY_KEY: Partial<Record<(typeof SERVICE_NAV_CONFIGS)[number]["navKey"], NavSectionKey>> = {
  "svc-api-gateway": "platform",
  "svc-bff-backoffice": "platform",
  "svc-bff-mobile": "platform",
  "svc-users": "games",
  "svc-quiz": "games",
  "svc-wordpass": "games",
  "svc-ai-stats": "ai",
  "svc-ai-api": "ai",
};

/** Builds the filtered navigation item list for a given role. */
export function navItemsForRole(role: BackofficeRole): NavItem[] {
  const items: NavItem[] = [
    {
      key: "svc-overview",
      section: "overview",
      title: "Service summary",
      subtitle: "Operational state and live consumption",
    },
    ...SERVICE_NAV_CONFIGS.map((config) => ({
      key: config.navKey,
      section: SERVICE_SECTION_BY_KEY[config.navKey] ?? "platform",
      title: config.title,
      subtitle: config.subtitle,
    })),
  ];

  if (roleCanModify(role)) {
    items.push({ key: "ai-diagnostics", section: "ai", title: "AI Diagnostics", subtitle: "Hallucination checks and RAG coverage" });
  }

  if (roleCanManageUsers(role)) {
    items.push({ key: "roles", section: "admin", title: "Role management", subtitle: "SuperAdmin manages Admin and Viewer access" });
  }

  return items;
}
