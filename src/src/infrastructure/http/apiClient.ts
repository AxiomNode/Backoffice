import { getConfigValue } from "../../runtimeConfig";

/** @module apiClient - HTTP client utilities for the edge API. */

const EDGE_API_BASE_STORAGE_KEY = "axiomnode.backoffice.edge-api-base-override";

function normalizeEdgeApiBaseUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Edge API base must use http or https");
  }

  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("Edge API base must not include path, query, or hash");
  }

  return parsed.origin;
}

function readEdgeApiBaseOverride(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(EDGE_API_BASE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeEdgeApiBaseUrl(raw);
  } catch {
    window.localStorage.removeItem(EDGE_API_BASE_STORAGE_KEY);
    return null;
  }
}

/** Base URL for the edge API gateway. */
export const DEFAULT_EDGE_API_BASE =
  normalizeEdgeApiBaseUrl(getConfigValue("VITE_API_BASE_URL", "http://localhost:7005") ?? "http://localhost:7005");

/** Base URL for the edge API gateway. */
export const EDGE_API_BASE = readEdgeApiBaseOverride() ?? DEFAULT_EDGE_API_BASE;

/** Static bearer token for edge API authentication (if configured). */
export const EDGE_API_TOKEN = getConfigValue("VITE_EDGE_API_TOKEN");

export function getEdgeApiBaseOverride(): string | null {
  return readEdgeApiBaseOverride();
}

export function setEdgeApiBaseOverride(baseUrl: string | null): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!baseUrl || baseUrl.trim().length === 0) {
    window.localStorage.removeItem(EDGE_API_BASE_STORAGE_KEY);
    return null;
  }

  const normalized = normalizeEdgeApiBaseUrl(baseUrl);
  window.localStorage.setItem(EDGE_API_BASE_STORAGE_KEY, normalized);
  return normalized;
}

function extractErrorDetail(raw: string): string | null {
  let current = raw.trim();
  if (!current) {
    return null;
  }

  for (let depth = 0; depth < 6; depth += 1) {
    const httpWrapped = current.match(/^HTTP\s+\d+\s*:\s*(.+)$/s);
    if (httpWrapped) {
      current = httpWrapped[1]?.trim() ?? current;
      continue;
    }

    try {
      const parsed = JSON.parse(current) as unknown;
      if (parsed && typeof parsed === "object") {
        const payload = parsed as { message?: unknown; detail?: unknown; error?: unknown };

        if (typeof payload.message === "string" && payload.message.trim()) {
          current = payload.message.trim();
          continue;
        }

        if (typeof payload.detail === "string" && payload.detail.trim()) {
          current = payload.detail.trim();
          continue;
        }

        if (typeof payload.error === "string" && payload.error.trim()) {
          current = payload.error.trim();
          continue;
        }
      }
    } catch {
      return current;
    }

    return current;
  }

  return current;
}

/** Performs a JSON fetch with automatic auth header injection and error handling. */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  const hasBody = options?.body !== undefined && options?.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (EDGE_API_TOKEN) {
    headers.set("Authorization", `Bearer ${EDGE_API_TOKEN}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(extractErrorDetail(body) || `HTTP ${response.status}: ${body || response.statusText}`);
  }

  return (await response.json()) as T;
}
