import type { ServiceCatalogItem, SessionContext } from "../../domain/types/backoffice";
import { UI_SERVICE_LAST_ERROR_STORAGE_PREFIX } from "../../domain/constants/ui";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";

/** @module operationalSummary - Fetches and aggregates operational status across all services. */

/** Row representing a single service's real-time operational status. */
export type ServiceOperationalRow = {
  key: string;
  title: string;
  domain: string;
  supportsData: boolean;
  online: boolean;
  accessGuaranteed: boolean;
  connectionError: boolean;
  requestsTotal: number | null;
  requestsPerSecond: number | null;
  generationRequestedTotal: number | null;
  generationCreatedTotal: number | null;
  generationConversionRatio: number | null;
  latencyMs: number | null;
  lastUpdatedAt: string | null;
  errorMessage: string | null;
  lastKnownError: { message: string; at: string } | null;
};

/** Aggregated operational summary with per-service rows and totals. */
export type ServiceOperationalSummary = {
  rows: ServiceOperationalRow[];
  totals: {
    total: number;
    onlineCount: number;
    accessIssues: number;
    connectionErrors: number;
  };
};

export type KubernetesOverview = {
  enabled: boolean;
  fetchedAt: string;
  namespace: string;
  source: "cluster" | "disabled";
  message: string | null;
  cluster: {
    apiBaseUrl: string | null;
    nodeCount: number;
    readyNodeCount: number;
    deploymentCount: number;
    podCount: number;
    runningPodCount: number;
    notReadyPodCount: number;
    restartCount: number;
    cpuUsageMillicores: number | null;
    cpuCapacityMillicores: number | null;
    cpuUsageRatio: number | null;
    memoryUsageBytes: number | null;
    memoryCapacityBytes: number | null;
    memoryUsageRatio: number | null;
    namespaceCpuRequestMillicores: number;
    namespaceCpuLimitMillicores: number;
    namespaceMemoryRequestBytes: number;
    namespaceMemoryLimitBytes: number;
  };
  nodes: Array<{
    name: string;
    ready: boolean;
    podCount: number;
    cpuUsageMillicores: number | null;
    cpuCapacityMillicores: number | null;
    cpuUsageRatio: number | null;
    memoryUsageBytes: number | null;
    memoryCapacityBytes: number | null;
    memoryUsageRatio: number | null;
  }>;
  workloads: Array<{
    name: string;
    image: string | null;
    desiredReplicas: number;
    readyReplicas: number;
    availableReplicas: number;
    updatedReplicas: number;
    podCount: number;
    readyPodCount: number;
    restartCount: number;
    cpuUsageMillicores: number;
    memoryUsageBytes: number;
    cpuRequestMillicores: number;
    cpuLimitMillicores: number;
    memoryRequestBytes: number;
    memoryLimitBytes: number;
    status: "healthy" | "degraded" | "down";
  }>;
  topPods: Array<{
    name: string;
    workload: string | null;
    nodeName: string | null;
    phase: string;
    ready: boolean;
    restartCount: number;
    cpuUsageMillicores: number;
    memoryUsageBytes: number;
    cpuRequestMillicores: number;
    memoryRequestBytes: number;
  }>;
};

export type DeploymentHistoryEntry = {
  version: string;
  deployedAt: string;
  commitSha: string;
  summary: string;
};

export type DeploymentHistory = {
  environment: string;
  currentVersion: string;
  currentDeployedAt: string;
  history: DeploymentHistoryEntry[];
};

type ServiceOperationalSummaryApiResponse = {
  rows: Array<Omit<ServiceOperationalRow, "lastKnownError"> & { lastKnownError?: { message: string; at: string } | null }>;
  totals: ServiceOperationalSummary["totals"];
};

/** Persists the last error for a service key in localStorage. */
export function storeServiceLastError(serviceKey: string, message: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload = JSON.stringify({
      message,
      at: new Date().toISOString(),
    });
    window.localStorage.setItem(`${UI_SERVICE_LAST_ERROR_STORAGE_PREFIX}.${serviceKey}`, payload);
  } catch {
    // Ignore storage failures.
  }
}

function readServiceLastError(serviceKey: string): { message: string; at: string } | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${UI_SERVICE_LAST_ERROR_STORAGE_PREFIX}.${serviceKey}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { message?: unknown; at?: unknown };
    if (typeof parsed.message !== "string" || typeof parsed.at !== "string") {
      return null;
    }
    return { message: parsed.message, at: parsed.at };
  } catch {
    return null;
  }
}

/** Fetches health and metrics for all services, computing request rates and conversion ratios. */
export async function fetchServiceOperationalSummary(
  context: SessionContext,
  _previousByService: Record<string, { requestsTotal: number | null; fetchedAt: number }>,
): Promise<ServiceOperationalSummary> {
  const payload = await fetchJson<ServiceOperationalSummaryApiResponse>(`${EDGE_API_BASE}/v1/backoffice/services/operational-summary`, {
    headers: composeAuthHeaders(context),
  });

  const rows: ServiceOperationalRow[] = (payload.rows ?? []).map((row) => {
    if (row.errorMessage) {
      storeServiceLastError(row.key, row.errorMessage);
    }

    return {
      ...row,
      lastKnownError: readServiceLastError(row.key),
    };
  });

  return {
    rows,
    totals: payload.totals,
  };
}

export async function fetchKubernetesOverview(context: SessionContext): Promise<KubernetesOverview> {
  return fetchJson<KubernetesOverview>(`${EDGE_API_BASE}/v1/backoffice/kubernetes/overview`, {
    headers: composeAuthHeaders(context),
  });
}

export async function fetchDeploymentHistory(context: SessionContext): Promise<DeploymentHistory> {
  return fetchJson<DeploymentHistory>(`${EDGE_API_BASE}/v1/backoffice/deployment-history`, {
    headers: composeAuthHeaders(context),
  });
}
