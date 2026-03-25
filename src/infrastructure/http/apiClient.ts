import { getConfigValue } from "../../runtimeConfig";

export const EDGE_API_BASE = getConfigValue("VITE_API_BASE_URL", "http://localhost:7005") ?? "http://localhost:7005";
export const EDGE_API_TOKEN = getConfigValue("VITE_EDGE_API_TOKEN");

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
