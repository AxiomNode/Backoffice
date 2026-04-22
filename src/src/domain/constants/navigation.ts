import type { NavKey, ServiceNavConfig } from "../types/backoffice";

/** @module navigation - Service navigation registry for the backoffice sidebar. */

/** Ordered list of service navigation entries displayed in the sidebar. */
export const SERVICE_NAV_CONFIGS: ServiceNavConfig[] = [
  {
    navKey: "svc-api-gateway",
    service: "api-gateway",
    title: "API Gateway",
    subtitle: "Entrada edge, routing y control CORS",
  },
  {
    navKey: "svc-bff-backoffice",
    service: "bff-backoffice",
    title: "BFF Backoffice",
    subtitle: "Agregador de consultas administrativas",
  },
  {
    navKey: "svc-bff-mobile",
    service: "bff-mobile",
    title: "BFF Mobile",
    subtitle: "Gateway móvil para juegos",
  },
  {
    navKey: "svc-users",
    service: "microservice-users",
    title: "Microservice Users",
    subtitle: "Usuarios, roles y leaderboard",
    defaultDataset: "roles",
    datasets: [
      { value: "roles", label: "Roles" },
      { value: "leaderboard", label: "Leaderboard" },
    ],
  },
  {
    navKey: "svc-quiz",
    service: "microservice-quiz",
    title: "Microservice Quiz",
    subtitle: "Generación y persistencia de quiz",
    defaultDataset: "history",
    datasets: [
      { value: "history", label: "Historial" },
      { value: "processes", label: "Procesos" },
    ],
  },
  {
    navKey: "svc-wordpass",
    service: "microservice-wordpass",
    title: "Microservice Wordpass",
    subtitle: "Generación y persistencia de word-pass",
    defaultDataset: "history",
    datasets: [
      { value: "history", label: "Historial" },
      { value: "processes", label: "Procesos" },
    ],
  },
  {
    navKey: "svc-ai-stats",
    service: "ai-engine-stats",
    title: "AI Engine Stats",
    subtitle: "Observabilidad y métricas del motor IA",
  },
  {
    navKey: "svc-ai-api",
    service: "ai-engine-api",
    title: "AI Engine API",
    subtitle: "Salud del servicio de generación",
  },
];

/** Set of all registered service navigation keys for quick lookup. */
export const SERVICE_NAV_KEYS = new Set<NavKey>(SERVICE_NAV_CONFIGS.map((item) => item.navKey));

/** Finds the service navigation config for a given nav key. */
export function navConfigByKey(key: NavKey): ServiceNavConfig | undefined {
  return SERVICE_NAV_CONFIGS.find((item) => item.navKey === key);
}
