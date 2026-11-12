import { useCallback, useEffect, useRef, useState } from "react";

import type { AiEngineTarget, SessionContext } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";

export type AiEngineProbeEndpointStatus = {
  ok: boolean;
  status: number | null;
  url: string;
  latencyMs: number | null;
  message: string | null;
};

export type AiEngineProbeResult = {
  host: string;
  protocol: "http" | "https";
  port: number;
  reachable: boolean;
  llama: AiEngineProbeEndpointStatus;
};

type UseAiEngineTargetStateOptions = {
  context: SessionContext;
  unknownErrorLabel: string;
  missingHostLabel?: string;
  applyBlockedLabel?: string;
};

const AI_ENGINE_TARGET_CHANGED_EVENT = "axiomnode:ai-engine-target-changed";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProtocol(value: unknown): "http" | "https" | null {
  return value === "http" || value === "https" ? value : null;
}

function normalizeAiTargetResponse(payload: unknown): AiEngineTarget {
  const record = asRecord(payload) ?? {};
  const apiBaseUrl = readNullableString(record.apiBaseUrl);
  const statsBaseUrl = readNullableString(record.statsBaseUrl);

  return {
    source: record.source === "env" ? "env" : "override",
    label: readNullableString(record.label),
    host: readNullableString(record.host),
    protocol: readProtocol(record.protocol),
    port: readNullableNumber(record.port) ?? readNullableNumber(record.apiPort),
    llamaBaseUrl: readNullableString(record.llamaBaseUrl) ?? (apiBaseUrl ? `${apiBaseUrl}/v1/completions` : null),
    envLlamaBaseUrl: readNullableString(record.envLlamaBaseUrl) ?? statsBaseUrl,
    updatedAt: readNullableString(record.updatedAt),
  };
}

function normalizeProbeEndpointStatus(payload: unknown, fallbackUrl: string): AiEngineProbeEndpointStatus {
  const record = asRecord(payload) ?? {};

  return {
    ok: record.ok === true,
    status: readNullableNumber(record.status),
    url: readNullableString(record.url) ?? fallbackUrl,
    latencyMs: readNullableNumber(record.latencyMs),
    message: readNullableString(record.message),
  };
}

function normalizeAiProbeResponse(payload: unknown): AiEngineProbeResult {
  const record = asRecord(payload) ?? {};
  const protocol = readProtocol(record.protocol) ?? "http";
  const host = readNullableString(record.host) ?? "";
  const port = readNullableNumber(record.port) ?? readNullableNumber(record.apiPort) ?? 7002;
  const fallbackUrl = `${protocol}://${host}:${port}/v1/models`;

  return {
    host,
    protocol,
    port,
    reachable: record.reachable === true,
    llama: normalizeProbeEndpointStatus(record.llama ?? record.api, fallbackUrl),
  };
}

function broadcastAiTargetChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AI_ENGINE_TARGET_CHANGED_EVENT));
  }
}

export function parseAiEnginePort(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function normalizeAiEngineDraftTarget(hostInput: string, protocolInput: "http" | "https", portInput: string) {
  const rawHost = hostInput.trim();
  let host = rawHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  let protocol: "http" | "https" = rawHost.toLowerCase().startsWith("https://") ? "https" : protocolInput;
  let port = parseAiEnginePort(portInput, protocol === "https" ? 443 : 7002);

  const pathIndex = host.indexOf("/");
  if (pathIndex >= 0) {
    host = host.slice(0, pathIndex);
  }

  const portMatch = host.match(/:(\d+)$/);
  if (portMatch?.[1]) {
    port = parseAiEnginePort(portMatch[1], port);
    host = host.replace(/:\d+$/, "");
  }

  if (port === 443 && host.endsWith(".trycloudflare.com")) {
    protocol = "https";
  }

  return { host, protocol, port };
}

function describeProbeFailure(applyBlockedLabel: string, probe: AiEngineProbeResult) {
  const detail = probe.llama.message ?? (probe.llama.status !== null ? `HTTP ${probe.llama.status}` : "unreachable");
  return `${applyBlockedLabel} Endpoint: ${probe.llama.url}. Detail: ${detail}.`;
}

/** State and actions for the ai-engine llama target: read, probe, apply and reset. */
export function useAiEngineTargetState({
  context,
  unknownErrorLabel,
  missingHostLabel = "Missing host",
  applyBlockedLabel = "Target probe failed",
}: UseAiEngineTargetStateOptions) {
  const [target, setTarget] = useState<AiEngineTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [protocol, setProtocol] = useState<"http" | "https">("http");
  const [port, setPort] = useState("7002");
  const labelRef = useRef(label);
  const hostRef = useRef(host);
  const protocolRef = useRef(protocol);
  const portRef = useRef(port);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<AiEngineProbeResult | null>(null);

  const authHeaders = useCallback(() => composeAuthHeaders(context), [context]);

  const updateLabel = useCallback((value: string) => {
    labelRef.current = value;
    setLabel(value);
  }, []);

  const updateHost = useCallback((value: string) => {
    hostRef.current = value;
    setHost(value);
  }, []);

  const updateProtocol = useCallback((value: "http" | "https") => {
    protocolRef.current = value;
    setProtocol(value);
  }, []);

  const updatePort = useCallback((value: string) => {
    portRef.current = value;
    setPort(value);
  }, []);

  const syncForm = useCallback((nextTarget: AiEngineTarget | null) => {
    updateLabel(nextTarget?.label ?? "");
    updateHost(nextTarget?.host ?? "");
    updateProtocol(nextTarget?.protocol ?? "http");
    updatePort(String(nextTarget?.port ?? 7002));
  }, [updateHost, updateLabel, updatePort, updateProtocol]);

  const refresh = useCallback(async () => {
    setTargetLoading(true);
    setTargetError(null);
    try {
      const targetPayload = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        headers: authHeaders(),
      });
      const nextTarget = normalizeAiTargetResponse(targetPayload);

      setTarget(nextTarget);
      syncForm(nextTarget);
    } catch (loadError) {
      setTargetError(loadError instanceof Error ? loadError.message : unknownErrorLabel);
    } finally {
      setTargetLoading(false);
    }
  }, [authHeaders, syncForm, unknownErrorLabel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onTargetChanged = () => {
      void refresh();
    };
    window.addEventListener(AI_ENGINE_TARGET_CHANGED_EVENT, onTargetChanged);
    return () => window.removeEventListener(AI_ENGINE_TARGET_CHANGED_EVENT, onTargetChanged);
  }, [refresh]);

  useEffect(() => {
    setProbeResult(null);
    setTargetError(null);
  }, [host, label, port, protocol]);

  const buildDraftTarget = useCallback(() => normalizeAiEngineDraftTarget(
    hostRef.current,
    protocolRef.current,
    portRef.current,
  ), []);

  const probeTarget = useCallback(async (targetOverride?: { host: string; protocol: "http" | "https"; port: number }) => {
    const payload = targetOverride ?? buildDraftTarget();

    if (!payload.host) {
      throw new Error(missingHostLabel);
    }

    setProbeLoading(true);
    setTargetError(null);
    try {
      const probePayload = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/probe`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const probe = normalizeAiProbeResponse(probePayload);
      setProbeResult(probe);
      setTargetError(null);
      return probe;
    } catch (probeError) {
      const message = probeError instanceof Error ? probeError.message : unknownErrorLabel;
      setTargetError(message);
      throw probeError;
    } finally {
      setProbeLoading(false);
    }
  }, [authHeaders, buildDraftTarget, missingHostLabel, unknownErrorLabel]);

  const applyDraftTarget = useCallback(async (options?: { probeFirst?: boolean }) => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      const draftTarget = buildDraftTarget();
      if (options?.probeFirst) {
        const probe = await probeTarget(draftTarget);

        if (!probe.reachable) {
          throw new Error(describeProbeFailure(applyBlockedLabel, probe));
        }
      }

      const nextTarget = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          host: draftTarget.host,
          protocol: draftTarget.protocol,
          port: draftTarget.port,
          label: labelRef.current.trim(),
        }),
      });
      setTarget(normalizeAiTargetResponse(nextTarget));
      await refresh();
      broadcastAiTargetChanged();
    } catch (saveError) {
      setTargetError(saveError instanceof Error ? saveError.message : unknownErrorLabel);
    } finally {
      setTargetSaving(false);
    }
  }, [applyBlockedLabel, authHeaders, buildDraftTarget, probeTarget, refresh, unknownErrorLabel]);

  const resetTarget = useCallback(async () => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      const nextTarget = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setTarget(normalizeAiTargetResponse(nextTarget));
      await refresh();
      broadcastAiTargetChanged();
    } catch (resetError) {
      setTargetError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setTargetSaving(false);
    }
  }, [authHeaders, refresh]);

  return {
    target,
    targetLoading,
    targetSaving,
    targetError,
    setTargetError,
    label,
    setLabel: updateLabel,
    host,
    setHost: updateHost,
    protocol,
    setProtocol: updateProtocol,
    port,
    setPort: updatePort,
    probeLoading,
    probeResult,
    refresh,
    buildDraftTarget,
    probeTarget,
    applyDraftTarget,
    resetTarget,
  };
}
