import type { ServiceCatalogItem, SessionContext } from "../../domain/types/backoffice";
import { UI_SERVICE_LAST_ERROR_STORAGE_PREFIX } from "../../domain/constants/ui";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";

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
  latencyMs: number | null;
  lastUpdatedAt: string | null;
  errorMessage: string | null;
  lastKnownError: { message: string; at: string } | null;
};

export type ServiceOperationalSummary = {
  rows: ServiceOperationalRow[];
  totals: {
    total: number;
    onlineCount: number;
    accessIssues: number;
    connectionErrors: number;
  };
};

type TimedResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

function asTimedResult<T>(promiseFactory: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  return promiseFactory()
    .then((data) => ({ ok: true as const, data, latencyMs: Math.round(performance.now() - start) }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
      latencyMs: Math.round(performance.now() - start),
    }));
}

function toRequestsTotal(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  const payload = metrics as Record<string, unknown>;
  const traffic = payload.traffic;

  if (traffic && typeof traffic === "object") {
    const value = (traffic as Record<string, unknown>).requestsReceivedTotal;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  const topLevel = payload.requestsReceivedTotal;
  if (typeof topLevel === "number" && Number.isFinite(topLevel)) {
    return topLevel;
  }

  return null;
}

function isAuthorizationError(message: string): boolean {
  return /HTTP\s+(401|403)/i.test(message);
}

function isConnectionError(message: string): boolean {
  return /Failed to fetch|NetworkError|HTTP\s+(5\d\d|429|408|0)/i.test(message);
}

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

export async function fetchServiceOperationalSummary(
  context: SessionContext,
  previousByService: Record<string, { requestsTotal: number | null; fetchedAt: number }>,
): Promise<ServiceOperationalSummary> {
  const catalogPayload = await fetchJson<{ services: ServiceCatalogItem[] }>(`${EDGE_API_BASE}/v1/backoffice/services`, {
    headers: composeAuthHeaders(context),
  });

  const services = catalogPayload.services ?? [];
  const now = Date.now();

  const metricsResults = await Promise.all(
    services.map(async (service) => {
      const result = await asTimedResult(() =>
        fetchJson<{ metrics: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${service.key}/metrics`, {
          headers: composeAuthHeaders(context),
        }),
      );
      return { service, result };
    }),
  );

  const rows: ServiceOperationalRow[] = metricsResults.map(({ service, result }) => {
    if (!result.ok) {
      storeServiceLastError(service.key, result.error);
      return {
        key: service.key,
        title: service.title,
        domain: service.domain,
        supportsData: service.supportsData,
        online: false,
        accessGuaranteed: !isAuthorizationError(result.error),
        connectionError: isConnectionError(result.error),
        requestsTotal: null,
        requestsPerSecond: null,
        latencyMs: result.latencyMs,
        lastUpdatedAt: new Date(now).toISOString(),
        errorMessage: result.error,
        lastKnownError: readServiceLastError(service.key),
      };
    }

    const requestsTotal = toRequestsTotal(result.data.metrics);
    const previous = previousByService[service.key];
    let requestsPerSecond: number | null = null;

    if (
      previous &&
      previous.requestsTotal !== null &&
      requestsTotal !== null &&
      now > previous.fetchedAt &&
      requestsTotal >= previous.requestsTotal
    ) {
      const deltaRequests = requestsTotal - previous.requestsTotal;
      const deltaSeconds = (now - previous.fetchedAt) / 1000;
      if (deltaSeconds > 0) {
        requestsPerSecond = Number((deltaRequests / deltaSeconds).toFixed(2));
      }
    }

    previousByService[service.key] = {
      requestsTotal,
      fetchedAt: now,
    };

    return {
      key: service.key,
      title: service.title,
      domain: service.domain,
      supportsData: service.supportsData,
      online: true,
      accessGuaranteed: true,
      connectionError: false,
      requestsTotal,
      requestsPerSecond,
      latencyMs: result.latencyMs,
      lastUpdatedAt: new Date(now).toISOString(),
      errorMessage: null,
      lastKnownError: readServiceLastError(service.key),
    };
  });

  const totals = {
    total: rows.length,
    onlineCount: rows.filter((row) => row.online).length,
    accessIssues: rows.filter((row) => !row.accessGuaranteed).length,
    connectionErrors: rows.filter((row) => row.connectionError).length,
  };

  return { rows, totals };
}
