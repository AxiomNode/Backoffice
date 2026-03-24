import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { backofficeAuth, type BackofficeSession, type RuntimeAuthMode } from "./auth";
import { getConfigValue } from "./runtimeConfig";

type BackofficeRole = "SuperAdmin" | "Admin" | "Viewer" | "Gamer";
type NavKey = "dashboard" | "leaderboard" | "hotfix" | "roles";

type StatsPayload = {
  service: string;
  uptimeSeconds?: number;
  traffic?: {
    requestsReceivedTotal?: number;
    requestBytesInTotal?: number;
    responseBytesOutTotal?: number;
  };
  auth?: {
    authAttemptsTotal?: number;
    authSuccessTotal?: number;
    authFailureTotal?: number;
  };
  gameplay?: {
    gameEventsStoredTotal?: number;
  };
  generation?: {
    generationSuccessTotal?: number;
  };
};

type LeaderboardResponse = {
  metric: "won" | "score" | "played";
  total: number;
  rows: Array<{
    userId: string;
    displayName: string;
    value: number;
  }>;
};

type RoleItem = {
  firebaseUid: string;
  displayName: string | null;
  email: string | null;
  role: BackofficeRole;
  createdAt: string;
  updatedAt: string;
};

type HotOperationResult = {
  status: "idle" | "loading" | "done" | "error";
  message: string;
};

type SessionContext = {
  mode: RuntimeAuthMode;
  idToken?: string;
  devUid?: string;
};

type NavItem = {
  key: NavKey;
  title: string;
  subtitle: string;
};

const EDGE_API_BASE = getConfigValue("VITE_API_BASE_URL", "http://localhost:7005") ?? "http://localhost:7005";
const EDGE_API_TOKEN = getConfigValue("VITE_EDGE_API_TOKEN");
const ADMIN_DEV_UID = getConfigValue("VITE_ADMIN_DEV_UID", "admin-dev-uid") ?? "admin-dev-uid";

function roleCanManageUsers(role: BackofficeRole): boolean {
  return role === "SuperAdmin";
}

function roleCanModify(role: BackofficeRole): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

function roleHasBackofficeAccess(role: BackofficeRole): boolean {
  return role !== "Gamer";
}

function navItemsForRole(role: BackofficeRole): NavItem[] {
  const items: NavItem[] = [
    { key: "dashboard", title: "Observacion", subtitle: "Metricas y estado del entorno" },
    { key: "leaderboard", title: "Control", subtitle: "Ranking y actividad de usuarios" },
  ];

  if (roleCanModify(role)) {
    items.push({ key: "hotfix", title: "Modificacion en caliente", subtitle: "Acciones de administracion runtime" });
  }

  if (roleCanManageUsers(role)) {
    items.push({ key: "roles", title: "Gestion de roles", subtitle: "SuperAdmin administra Admin/Viewer" });
  }

  return items;
}

function composeAuthHeaders(context?: SessionContext): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!context) {
    return headers;
  }

  if (context.idToken) {
    headers.authorization = `Bearer ${context.idToken}`;
    headers["x-firebase-id-token"] = context.idToken;
  }
  if (context.mode === "dev" && context.devUid) {
    headers["x-dev-firebase-uid"] = context.devUid;
  }
  return headers;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
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

function Sidebar({
  current,
  onChange,
  items,
}: {
  current: NavKey;
  onChange: (key: NavKey) => void;
  items: NavItem[];
}) {
  const item = (key: NavKey, title: string, subtitle: string) => {
    const active = current === key;
    return (
      <button
        type="button"
        onClick={() => onChange(key)}
        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
          active
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
            : "border-[var(--md-sys-color-outline-variant)] bg-white/60 hover:bg-[var(--md-sys-color-surface-container)]"
        }`}
      >
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{subtitle}</p>
      </button>
    );
  };

  return (
    <aside className="m3-card h-fit p-4 lg:sticky lg:top-4">
      <div className="mb-4 border-b border-[var(--md-sys-color-outline-variant)] pb-3">
        <img src="/axiomnode-logo.svg" alt="AxiomNode" className="mb-3 h-8 w-auto" />
        <p className="m3-title text-base">AxiomNode Backoffice</p>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Control operativo y cambios en caliente</p>
      </div>
      <div className="space-y-2">
        {items.map((navItem) => item(navItem.key, navItem.title, navItem.subtitle))}
      </div>
    </aside>
  );
}

function DashboardPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatsPayload | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<StatsPayload>(`${EDGE_API_BASE}/v1/backoffice/monitor/stats`);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const tiles = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { label: "Requests", value: data.traffic?.requestsReceivedTotal ?? 0 },
      { label: "Auth Success", value: data.auth?.authSuccessTotal ?? 0 },
      { label: "Eventos de juego", value: data.gameplay?.gameEventsStoredTotal ?? 0 },
      { label: "Generacion OK", value: data.generation?.generationSuccessTotal ?? 0 },
    ];
  }, [data]);

  return (
    <section className="m3-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m3-title text-xl">Observacion Del Sistema</h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            Vista operativa para admins: estado del servicio, trafico, auth y generacion.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStats}
          className="rounded-xl bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary)]"
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {!data && !error && (
        <p className="rounded-lg border border-dashed border-[var(--md-sys-color-outline)] p-4 text-sm">
          Pulsa "Actualizar" para cargar las metricas actuales.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map((tile) => (
              <article key={tile.label} className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{tile.label}</p>
                <p className="mt-1 text-2xl font-bold">{tile.value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="font-semibold">Servicio</h3>
              <p className="text-sm">{data.service}</p>
              <p className="mt-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">Uptime: {data.uptimeSeconds ?? 0}s</p>
            </article>
            <article className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="font-semibold">Trafico</h3>
              <p className="text-sm">Request bytes: {data.traffic?.requestBytesInTotal ?? 0}</p>
              <p className="text-sm">Response bytes: {data.traffic?.responseBytesOutTotal ?? 0}</p>
            </article>
          </div>
        </>
      )}
    </section>
  );
}

function LeaderboardPanel() {
  const [metric, setMetric] = useState<"won" | "score" | "played">("won");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  const loadLeaderboard = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ metric, limit: String(limit) });
      const payload = await fetchJson<LeaderboardResponse>(`${EDGE_API_BASE}/v1/backoffice/users/leaderboard?${query.toString()}`);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="m3-card p-5">
      <h2 className="m3-title text-xl">Control De Usuarios</h2>
      <p className="mb-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">Ranking para administracion y seguimiento de actividad.</p>

      <form onSubmit={loadLeaderboard} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs">Metrica</span>
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as "won" | "score" | "played")}
            className="w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-2"
          >
            <option value="won">won</option>
            <option value="score">score</option>
            <option value="played">played</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs">Limite</span>
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value || 10))}
            className="w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-2"
          />
        </label>

        <div className="md:col-span-2 md:flex md:items-end">
          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--md-sys-color-secondary)] px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-on-secondary)]"
          >
            {loading ? "Cargando..." : "Consultar leaderboard"}
          </button>
        </div>
      </form>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm">Aun no hay datos cargados.</p>}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--md-sys-color-surface-container)] text-left">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.userId} className="border-t border-[var(--md-sys-color-outline-variant)]">
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.userId}</td>
                  <td className="px-3 py-2">{row.displayName}</td>
                  <td className="px-3 py-2 font-semibold">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HotfixPanel({
  session,
  context,
}: {
  session: BackofficeSession;
  context: SessionContext;
}) {
  const [topic, setTopic] = useState("Historia");
  const [categoryId, setCategoryId] = useState("23");
  const [result, setResult] = useState<HotOperationResult>({ status: "idle", message: "Sin ejecutar" });

  const [eventScore, setEventScore] = useState(80);
  const [eventType, setEventType] = useState("quiz");

  const modifyEnabled = roleCanModify(session.role);

  const runGeneration = async (gameType: "quiz" | "wordpass") => {
    if (!modifyEnabled) {
      setResult({ status: "error", message: "Tu rol no puede modificar datos." });
      return;
    }

    setResult({ status: "loading", message: `Lanzando generacion ${gameType}...` });
    try {
      const endpoint = gameType === "quiz" ? `${EDGE_API_BASE}/v1/mobile/games/quiz/generate` : `${EDGE_API_BASE}/v1/mobile/games/wordpass/generate`;
      const payload = { language: "es", categoryId, topic, numQuestions: 1 };
      const response = await fetchJson<{ gameType: string }>(endpoint, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify(payload),
      });
      setResult({ status: "done", message: `Generacion OK para ${response.gameType}.` });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : "Error desconocido" });
    }
  };

  const injectUserEvent = async () => {
    if (!modifyEnabled) {
      setResult({ status: "error", message: "Tu rol no puede modificar datos." });
      return;
    }

    setResult({ status: "loading", message: "Registrando evento operativo en caliente..." });
    try {
      const payload = {
        gameType: eventType,
        categoryId,
        categoryName: topic,
        language: "es",
        outcome: "won",
        score: eventScore,
        durationSeconds: 120,
        metadata: { source: "backoffice-hotfix" },
      };

      await fetchJson<{ message: string }>(`${EDGE_API_BASE}/v1/backoffice/users/events/manual`, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify(payload),
      });

      setResult({ status: "done", message: "Evento de juego registrado en caliente via edge/bff-backoffice." });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : "Error desconocido" });
    }
  };

  return (
    <section className="m3-card p-5">
      <h2 className="m3-title text-xl">Modificacion En Caliente</h2>
      <p className="mb-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">Herramientas iniciales para admins: disparar generacion y ajustar datos operativos en runtime.</p>

      {!modifyEnabled && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Rol {session.role}: solo observacion. No puedes modificar datos.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">Control de generacion IA</h3>
          <label className="mb-2 block text-sm">
            Topic
            <input value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
          </label>
          <label className="mb-3 block text-sm">
            Category ID (string)
            <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!modifyEnabled} onClick={() => runGeneration("quiz")} className="flex-1 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50">Generar quiz</button>
            <button type="button" disabled={!modifyEnabled} onClick={() => runGeneration("wordpass")} className="flex-1 rounded-lg bg-[var(--md-sys-color-tertiary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-tertiary)] disabled:cursor-not-allowed disabled:opacity-50">Generar word-pass</button>
          </div>
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">Ajuste operativo de datos</h3>
          <label className="mb-2 block text-sm">
            Tipo de juego
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2">
              <option value="quiz">quiz</option>
              <option value="word-pass">word-pass</option>
            </select>
          </label>
          <label className="mb-3 block text-sm">
            Score
            <input type="number" value={eventScore} onChange={(event) => setEventScore(Number(event.target.value || 0))} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" />
          </label>
          <button type="button" disabled={!modifyEnabled} onClick={injectUserEvent} className="w-full rounded-lg bg-[var(--md-sys-color-secondary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Registrar evento manual</button>
        </article>
      </div>

      <p className={`mt-4 rounded-lg p-3 text-sm ${result.status === "error" ? "bg-red-50 text-red-700" : result.status === "done" ? "bg-emerald-50 text-emerald-700" : "bg-[var(--md-sys-color-surface-container)]"}`}>{result.message}</p>
    </section>
  );
}

function RoleManagementPanel({ context }: { context: SessionContext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RoleItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<{ total: number; users: RoleItem[] }>(`${EDGE_API_BASE}/v1/backoffice/admin/users/roles`, {
        headers: composeAuthHeaders(context),
      });
      setItems(payload.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRoleChange = async (firebaseUid: string, nextRole: BackofficeRole) => {
    setError(null);
    try {
      await fetchJson<{ message: string }>(`${EDGE_API_BASE}/v1/backoffice/admin/users/roles/${encodeURIComponent(firebaseUid)}`, {
        method: "PATCH",
        headers: composeAuthHeaders(context),
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  return (
    <section className="m3-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="m3-title text-xl">Gestion De Roles</h2>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">Solo SuperAdmin puede cambiar roles de usuarios.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm">Refrescar</button>
      </div>

      {loading && <p className="text-sm">Cargando usuarios...</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--md-sys-color-surface-container)] text-left">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">UID</th>
              <th className="px-3 py-2">Rol</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.firebaseUid} className="border-t border-[var(--md-sys-color-outline-variant)]">
                <td className="px-3 py-2">{item.displayName ?? "-"}</td>
                <td className="px-3 py-2">{item.email ?? "-"}</td>
                <td className="px-3 py-2 font-mono text-xs">{item.firebaseUid}</td>
                <td className="px-3 py-2">
                  <select
                    value={item.role}
                    onChange={(event) => void onRoleChange(item.firebaseUid, event.target.value as BackofficeRole)}
                    className="rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-1"
                    disabled={item.role === "SuperAdmin"}
                  >
                    <option value="SuperAdmin">SuperAdmin</option>
                    <option value="Admin">Admin</option>
                    <option value="Viewer">Viewer</option>
                    <option value="Gamer">Gamer</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoginGate({ onAuthenticated }: { onAuthenticated: (session: BackofficeSession, context: SessionContext) => void }) {
  const mode = backofficeAuth.mode;
  const [devUid, setDevUid] = useState(ADMIN_DEV_UID);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bootstrapSession = useCallback(
    async (context: SessionContext) => {
      const sessionPayload = await fetchJson<{ role: BackofficeRole }>(`${EDGE_API_BASE}/v1/backoffice/auth/session`, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify(context.idToken ? { idToken: context.idToken } : {}),
      });

      const mePayload = await fetchJson<{
        profile: { firebaseUid: string; displayName: string | null; email: string | null };
        role: BackofficeRole;
      }>(`${EDGE_API_BASE}/v1/backoffice/auth/me`, {
        headers: composeAuthHeaders(context),
      });

      const resolvedRole = mePayload.role ?? sessionPayload.role;
      if (!roleHasBackofficeAccess(resolvedRole)) {
        throw new Error("Rol Gamer no tiene acceso al backoffice.");
      }

      const session: BackofficeSession = {
        isAuthenticated: true,
        displayName: mePayload.profile.displayName || mePayload.profile.email || "Operador",
        email: mePayload.profile.email || undefined,
        role: resolvedRole,
        firebaseUid: mePayload.profile.firebaseUid,
        provider: context.mode,
      };

      onAuthenticated(session, context);
    },
    [onAuthenticated],
  );

  useEffect(() => {
    if (mode !== "firebase") {
      return;
    }

    const unsubscribe = backofficeAuth.onSessionChanged(async (runtimeSession) => {
      if (!runtimeSession?.idToken) {
        return;
      }

      try {
        await bootstrapSession({ mode: "firebase", idToken: runtimeSession.idToken });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de autenticacion");
      }
    });

    return unsubscribe;
  }, [bootstrapSession, mode]);

  const onClickFirebase = async () => {
    setError(null);
    setLoading(true);
    try {
      await backofficeAuth.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticacion");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitDev = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await bootstrapSession({ mode: "dev", devUid });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de acceso");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center p-4">
      <section className="m3-card w-full p-6">
        <img src="/axiomnode-logo.svg" alt="AxiomNode" className="mb-4 h-8 w-auto" />
        <h1 className="m3-title text-2xl">Acceso Backoffice</h1>
        <p className="mb-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">Modo activo: {mode}</p>

        {mode === "firebase" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void onClickFirebase()}
              className="w-full rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-2 font-semibold text-[var(--md-sys-color-on-primary)]"
            >
              {loading ? "Abriendo Google..." : "Entrar con Google"}
            </button>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Usa una cuenta autorizada en Firebase Auth (Google provider).
            </p>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={onSubmitDev}>
            <label className="block text-sm">
              UID de desarrollo
              <input value={devUid} onChange={(event) => setDevUid(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2" required />
            </label>
            <button type="submit" className="w-full rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-2 font-semibold text-[var(--md-sys-color-on-primary)]">
              {loading ? "Entrando..." : "Continuar"}
            </button>
          </form>
        )}

        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </section>
    </div>
  );
}

function BackofficeLayout({
  session,
  context,
  onSignOut,
}: {
  session: BackofficeSession;
  context: SessionContext;
  onSignOut: () => void;
}) {
  const navItems = useMemo(() => navItemsForRole(session.role as BackofficeRole), [session.role]);
  const [current, setCurrent] = useState<NavKey>(navItems[0]?.key ?? "dashboard");

  useEffect(() => {
    const currentAllowed = navItems.some((item) => item.key === current);
    if (!currentAllowed) {
      setCurrent(navItems[0]?.key ?? "dashboard");
    }
  }, [current, navItems]);

  return (
    <div className="mx-auto grid min-h-screen max-w-7xl gap-4 p-4 lg:grid-cols-[280px_1fr]">
      <Sidebar current={current} onChange={setCurrent} items={navItems} />
      <main className="space-y-4">
        <header className="m3-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--md-sys-color-on-surface-variant)]">Admin Console</p>
              <h1 className="m3-title text-2xl">Entorno De Control, Observacion Y Modificacion En Caliente</h1>
              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Sesion: {session.displayName} ({session.role})
              </p>
            </div>
            <button type="button" onClick={onSignOut} className="rounded-lg border border-[var(--md-sys-color-outline)] px-3 py-2 text-sm">Salir</button>
          </div>
        </header>

        {current === "dashboard" && <DashboardPanel />}
        {current === "leaderboard" && <LeaderboardPanel />}
        {current === "hotfix" && roleCanModify(session.role as BackofficeRole) && <HotfixPanel session={session} context={context} />}
        {current === "roles" && roleCanManageUsers(session.role as BackofficeRole) && <RoleManagementPanel context={context} />}
      </main>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<BackofficeSession | null>(null);
  const [context, setContext] = useState<SessionContext | null>(null);

  const handleAuthenticated = (nextSession: BackofficeSession, nextContext: SessionContext) => {
    setSession(nextSession);
    setContext(nextContext);
  };

  const handleSignOut = async () => {
    await backofficeAuth.signOut();
    setSession(null);
    setContext(null);
  };

  if (!session || !context) {
    return <LoginGate onAuthenticated={handleAuthenticated} />;
  }

  return <BackofficeLayout session={session} context={context} onSignOut={handleSignOut} />;
}
