import type { BackofficeRole, NavItem } from "../../domain/types/backoffice";
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

/** Builds the filtered navigation item list for a given role. */
export function navItemsForRole(role: BackofficeRole): NavItem[] {
  const items: NavItem[] = [
    {
      key: "svc-overview",
      title: "Resumen de servicios",
      subtitle: "Estado operativo y consumo en tiempo real",
    },
    ...SERVICE_NAV_CONFIGS.map((config) => ({
    key: config.navKey,
    title: config.title,
    subtitle: config.subtitle,
    })),
  ];

  if (roleCanModify(role)) {
    items.push({ key: "ai-diagnostics", title: "AI Diagnostics", subtitle: "Tests de alucinacion y medidor RAG" });
    items.push({ key: "hotfix", title: "Modificacion en caliente", subtitle: "Acciones de administracion runtime" });
  }

  if (roleCanManageUsers(role)) {
    items.push({ key: "roles", title: "Gestion de roles", subtitle: "SuperAdmin administra Admin/Viewer" });
  }

  return items;
}
