import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AiEngineTarget, AiEngineTargetPreset, SessionContext } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";

type AiEnginePresetListResponse = {
  total: number;
  presets: AiEngineTargetPreset[];
};

export type AiEngineTargetPresetState = AiEngineTargetPreset & {
  active?: boolean;
};

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

function findPresetMatch(entries: AiEngineTargetPreset[], target: AiEngineTarget | null) {
  if (!target) {
    return null;
  }

  const protocol = target.protocol ?? "http";
  const directMatch = entries.find(
    (entry) =>
      entry.host === (target.host ?? "") &&
      entry.protocol === protocol &&
      entry.port === target.port,
  );

  if (directMatch) {
    return directMatch;
  }

  const protocolPortMatches = entries.filter((entry) => entry.protocol === protocol && entry.port === target.port);
  return protocolPortMatches.length === 1 ? protocolPortMatches[0] ?? null : null;
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
  const [presets, setPresets] = useState<AiEngineTargetPresetState[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetHost, setPresetHost] = useState("");
  const [presetProtocol, setPresetProtocol] = useState<"http" | "https">("http");
  const [presetPort, setPresetPort] = useState("7002");
  const presetNameRef = useRef(presetName);
  const presetHostRef = useRef(presetHost);
  const presetProtocolRef = useRef(presetProtocol);
  const presetPortRef = useRef(presetPort);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<AiEngineProbeResult | null>(null);

  const authHeaders = useCallback(() => composeAuthHeaders(context), [context]);

  const updatePresetName = useCallback((value: string) => {
    presetNameRef.current = value;
    setPresetName(value);
  }, []);

  const updatePresetHost = useCallback((value: string) => {
    presetHostRef.current = value;
    setPresetHost(value);
  }, []);

  const updatePresetProtocol = useCallback((value: "http" | "https") => {
    presetProtocolRef.current = value;
    setPresetProtocol(value);
  }, []);

  const updatePresetPort = useCallback((value: string) => {
    presetPortRef.current = value;
    setPresetPort(value);
  }, []);

  const syncTargetForm = useCallback((nextTarget: AiEngineTarget | null) => {
    updatePresetName(nextTarget?.label ?? "");
    updatePresetHost(nextTarget?.host ?? "");
    updatePresetProtocol(nextTarget?.protocol ?? "http");
    updatePresetPort(String(nextTarget?.port ?? 7002));
  }, [updatePresetHost, updatePresetName, updatePresetPort, updatePresetProtocol]);

  const syncPresetForm = useCallback((preset: AiEngineTargetPreset | null) => {
    updatePresetName(preset?.name ?? "");
    updatePresetHost(preset?.host ?? "");
    updatePresetProtocol(preset?.protocol ?? "http");
    updatePresetPort(String(preset?.port ?? 7002));
  }, [updatePresetHost, updatePresetName, updatePresetPort, updatePresetProtocol]);

  const refresh = useCallback(async () => {
    setTargetLoading(true);
    setPresetsLoading(true);
    setTargetError(null);
    try {
      let presetLoadError: string | null = null;
      const [targetPayload, presetPayload] = await Promise.all([
        fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, { headers: authHeaders() }),
        (async () => {
          try {
            return await fetchJson<AiEnginePresetListResponse>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets`, { headers: authHeaders() });
          } catch (presetError) {
            presetLoadError = presetError instanceof Error ? presetError.message : unknownErrorLabel;
            return { total: 0, presets: [] };
          }
        })(),
      ]);
      const nextTarget = normalizeAiTargetResponse(targetPayload);
      const activePreset = findPresetMatch(presetPayload.presets, nextTarget)
        ?? (presetPayload.presets.length === 1 ? presetPayload.presets[0] ?? null : null);
      const nextPresets = presetPayload.presets.map((entry) => ({
        ...entry,
        active: entry.id === activePreset?.id,
      }));

      setTarget(nextTarget);
      setPresets(nextPresets);
      setSelectedPresetId(activePreset?.id ?? "");
      if (!isCreatingPreset) {
        activePreset ? syncPresetForm(activePreset) : syncTargetForm(nextTarget);
      }
      setTargetError(presetLoadError);
    } catch (loadError) {
      setTargetError(loadError instanceof Error ? loadError.message : unknownErrorLabel);
    } finally {
      setTargetLoading(false);
      setPresetsLoading(false);
    }
  }, [authHeaders, isCreatingPreset, syncPresetForm, syncTargetForm, unknownErrorLabel]);

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
    if (isCreatingPreset) {
      syncPresetForm(null);
      return;
    }

    const selected = presets.find((entry) => entry.id === selectedPresetId) ?? null;
    if (selected) {
      syncPresetForm(selected);
      return;
    }

    syncTargetForm(target);
  }, [isCreatingPreset, presets, selectedPresetId, syncPresetForm, syncTargetForm, target]);

  useEffect(() => {
    setProbeResult(null);
    setTargetError(null);
  }, [isCreatingPreset, presetHost, presetName, presetPort, presetProtocol, selectedPresetId]);

  const activePreset = useMemo(
    () => (isCreatingPreset ? null : presets.find((entry) => entry.id === selectedPresetId) ?? null),
    [isCreatingPreset, presets, selectedPresetId],
  );

  const buildDraftTarget = useCallback(() => normalizeAiEngineDraftTarget(
    presetHostRef.current,
    presetProtocolRef.current,
    presetPortRef.current,
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
          label: presetNameRef.current.trim(),
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

  const savePreset = useCallback(async () => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      const payload = {
        name: presetNameRef.current.trim(),
        ...buildDraftTarget(),
      };
      const saved = activePreset && !isCreatingPreset
        ? await fetchJson<AiEngineTargetPreset>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets/${encodeURIComponent(activePreset.id)}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          })
        : await fetchJson<AiEngineTargetPreset>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

      setIsCreatingPreset(false);
      setSelectedPresetId(saved.id);
      await refresh();
      setSelectedPresetId(saved.id);
      syncPresetForm(saved);
      broadcastAiTargetChanged();
    } catch (saveError) {
      setTargetError(saveError instanceof Error ? saveError.message : unknownErrorLabel);
    } finally {
      setTargetSaving(false);
    }
  }, [activePreset, authHeaders, isCreatingPreset, refresh, syncPresetForm, unknownErrorLabel]);

  const activateSelectedPreset = useCallback(async (options?: { probeFirst?: boolean }) => {
    if (!activePreset) {
      return;
    }

    setTargetSaving(true);
    setTargetError(null);
    try {
      if (options?.probeFirst) {
        const probe = await probeTarget({
          host: activePreset.host,
          protocol: activePreset.protocol,
          port: activePreset.port,
        });

        if (!probe.reachable) {
          throw new Error(describeProbeFailure(applyBlockedLabel, probe));
        }
      }

      const nextTarget = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          host: activePreset.host,
          protocol: activePreset.protocol,
          port: activePreset.port,
          label: activePreset.name,
        }),
      });
      setTarget(normalizeAiTargetResponse(nextTarget));
      setIsCreatingPreset(false);
      await refresh();
      broadcastAiTargetChanged();
    } catch (saveError) {
      setTargetError(saveError instanceof Error ? saveError.message : unknownErrorLabel);
    } finally {
      setTargetSaving(false);
    }
  }, [activePreset, applyBlockedLabel, authHeaders, probeTarget, refresh, unknownErrorLabel]);

  const deleteSelectedPreset = useCallback(async () => {
    if (!activePreset) {
      return;
    }

    setTargetSaving(true);
    setTargetError(null);
    try {
      await fetchJson<{ deleted: boolean; presetId: string }>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets/${encodeURIComponent(activePreset.id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setSelectedPresetId("");
      setIsCreatingPreset(false);
      await refresh();
      broadcastAiTargetChanged();
    } catch (deleteError) {
      setTargetError(deleteError instanceof Error ? deleteError.message : unknownErrorLabel);
    } finally {
      setTargetSaving(false);
    }
  }, [activePreset, authHeaders, refresh, unknownErrorLabel]);

  const resetTarget = useCallback(async () => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      const nextTarget = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setTarget(normalizeAiTargetResponse(nextTarget));
      setSelectedPresetId("");
      setIsCreatingPreset(false);
      await refresh();
      broadcastAiTargetChanged();
    } catch (resetError) {
      setTargetError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setTargetSaving(false);
    }
  }, [authHeaders, refresh, unknownErrorLabel]);

  const startNewPreset = useCallback(() => {
    setIsCreatingPreset(true);
    setSelectedPresetId("");
    syncPresetForm(null);
  }, [syncPresetForm]);

  return {
    target,
    targetLoading,
    targetSaving,
    targetError,
    setTargetError,
    presets,
    presetsLoading,
    selectedPresetId,
    setSelectedPresetId,
    isCreatingPreset,
    setIsCreatingPreset,
    presetName,
    setPresetName: updatePresetName,
    presetHost,
    setPresetHost: updatePresetHost,
    presetProtocol,
    setPresetProtocol: updatePresetProtocol,
    presetPort,
    setPresetPort: updatePresetPort,
    activePreset,
    probeLoading,
    probeResult,
    refresh,
    buildDraftTarget,
    probeTarget,
    applyDraftTarget,
    savePreset,
    activateSelectedPreset,
    deleteSelectedPreset,
    resetTarget,
    startNewPreset,
  };
}
