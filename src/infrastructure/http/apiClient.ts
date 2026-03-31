import { getConfigValue } from "../../runtimeConfig";

/** @module apiClient - HTTP client utilities for the edge API. */

/** Base URL for the edge API gateway. */
export const EDGE_API_BASE = getConfigValue("VITE_API_BASE_URL", "http://localhost:7005") ?? "http://localhost:7005";

/** Static bearer token for edge API authentication (if configured). */
export const EDGE_API_TOKEN = getConfigValue("VITE_EDGE_API_TOKEN");

/** Performs a JSON fetch with automatic auth header injection and error handling. */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (EDGE_API_TOKEN) {
    headers.set("Authorization", `Bearer ${EDGE_API_TOKEN}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
  }

  return (await response.json()) as T;
}
