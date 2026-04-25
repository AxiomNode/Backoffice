import type { NavKey, ServiceNavConfig } from "../types/backoffice";

/** @module navigation - Service navigation registry for the backoffice sidebar. */

/** Ordered list of service navigation entries displayed in the sidebar. */
export const SERVICE_NAV_CONFIGS: ServiceNavConfig[] = [
  {
    navKey: "svc-api-gateway",
    service: "api-gateway",
    title: "API Gateway",
    subtitle: "Edge entry, routing and CORS control",
  },
  {
    navKey: "svc-bff-backoffice",
    service: "bff-backoffice",
    title: "BFF Backoffice",
    subtitle: "Administrative query aggregator",
  },
  {
    navKey: "svc-bff-mobile",
    service: "bff-mobile",
    title: "BFF Mobile",
    subtitle: "Mobile gateway for games",
  },
  {
    navKey: "svc-users",
    service: "microservice-users",
    title: "Microservice Users",
    subtitle: "Users, roles and leaderboard",
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
    subtitle: "Quiz generation and persistence",
    defaultDataset: "history",
    datasets: [
      { value: "history", label: "History" },
      { value: "processes", label: "Processes" },
    ],
  },
  {
    navKey: "svc-wordpass",
    service: "microservice-wordpass",
    title: "Microservice Wordpass",
    subtitle: "Word-pass generation and persistence",
    defaultDataset: "history",
    datasets: [
      { value: "history", label: "History" },
      { value: "processes", label: "Processes" },
    ],
  },
  {
    navKey: "svc-ai-stats",
    service: "ai-engine-stats",
    title: "AI Engine Stats",
    subtitle: "Observability and AI engine metrics",
  },
  {
    navKey: "svc-ai-api",
    service: "ai-engine-api",
    title: "AI Engine API",
    subtitle: "Generation service health",
  },
];

/** Set of all registered service navigation keys for quick lookup. */
export const SERVICE_NAV_KEYS = new Set<NavKey>(SERVICE_NAV_CONFIGS.map((item) => item.navKey));

/** Finds the service navigation config for a given nav key. */
export function navConfigByKey(key: NavKey): ServiceNavConfig | undefined {
  return SERVICE_NAV_CONFIGS.find((item) => item.navKey === key);
}
