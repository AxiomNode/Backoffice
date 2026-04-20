import { lazy, Suspense, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

import type { BackofficeSession } from "../../auth";
import { fetchServiceOperationalSummary } from "../../application/services/operationalSummary";
import deploymentHistory from "../../data/deployment-history.json";
import { navItemsForRole, roleCanManageUsers, roleCanModify } from "../../application/services/rolePolicies";
import { SERVICE_NAV_KEYS } from "../../domain/constants/navigation";
import { ACCENT_OPTIONS, UI_DENSITY_STORAGE_KEY, UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../../domain/constants/ui";
import type { NavKey, SessionContext, UiAccent, UiDensity, UiTheme, UiTypography } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";
import { ACCENT_LABEL_KEYS, LANGUAGE_OPTIONS, type LabelKey } from "../../i18n/labels";
import { useHashRoute, routeFromNavKey } from "../hooks/useHashRoute";
import { useVisibilityPolling } from "../hooks/useVisibilityPolling";
import { Sidebar } from "../components/Sidebar";

/** @module BackofficeLayout - Main authenticated layout with sidebar, header, and lazy-loaded panels. */

const AIDiagnosticsPanel = lazy(() => import("../panels/AIDiagnosticsPanel").then((m) => ({ default: m.AIDiagnosticsPanel })));
const RoleManagementPanel = lazy(() => import("../panels/RoleManagementPanel").then((m) => ({ default: m.RoleManagementPanel })));
const ServiceConsolePanel = lazy(() => import("../panels/ServiceConsolePanel").then((m) => ({ default: m.ServiceConsolePanel })));
const ServiceOverviewPanel = lazy(() => import("../panels/ServiceOverviewPanel").then((m) => ({ default: m.ServiceOverviewPanel })));

const NAV_LABELS: Record<NavKey, { title: LabelKey; subtitle: LabelKey }> = {
  "svc-overview": { title: "nav.svc-overview.title", subtitle: "nav.svc-overview.subtitle" },
  "svc-api-gateway": { title: "nav.svc-api-gateway.title", subtitle: "nav.svc-api-gateway.subtitle" },
  "svc-bff-backoffice": { title: "nav.svc-bff-backoffice.title", subtitle: "nav.svc-bff-backoffice.subtitle" },
  "svc-bff-mobile": { title: "nav.svc-bff-mobile.title", subtitle: "nav.svc-bff-mobile.subtitle" },
  "svc-users": { title: "nav.svc-users.title", subtitle: "nav.svc-users.subtitle" },
  "svc-quiz": { title: "nav.svc-quiz.title", subtitle: "nav.svc-quiz.subtitle" },
  "svc-wordpass": { title: "nav.svc-wordpass.title", subtitle: "nav.svc-wordpass.subtitle" },
  "svc-ai-stats": { title: "nav.svc-ai-stats.title", subtitle: "nav.svc-ai-stats.subtitle" },
  "svc-ai-api": { title: "nav.svc-ai-api.title", subtitle: "nav.svc-ai-api.subtitle" },
  "ai-diagnostics": { title: "nav.ai-diagnostics.title", subtitle: "nav.ai-diagnostics.subtitle" },
  roles: { title: "nav.roles.title", subtitle: "nav.roles.subtitle" },
};

type BackofficeLayoutProps = {
  session: BackofficeSession;
  context: SessionContext;
  onSignOut: () => void;
  theme: UiTheme;
  accent: UiAccent;
  typography: UiTypography;
  onToggleTheme: () => void;
  onAccentChange: (value: UiAccent) => void;
  onTypographyChange: (value: UiTypography) => void;
};

const TYPOGRAPHY_OPTIONS: UiTypography[] = ["sm", "normal", "lg", "xl", "xxl"];
const TYPOGRAPHY_LABEL_KEYS: Record<UiTypography, LabelKey> = {
  sm: "typography.sm",
  normal: "typography.normal",
  lg: "typography.lg",
  xl: "typography.xl",
  xxl: "typography.xxl",
};

/** Main backoffice layout with sidebar navigation, preferences, and routed panel content. */
export function BackofficeLayout({
  session,
  context,
  onSignOut,
  theme,
  accent,
  typography,
  onToggleTheme,
  onAccentChange,
  onTypographyChange,
}: BackofficeLayoutProps) {
  const { language, setLanguage, t } = useI18n();
  const navItems = useMemo(
    () =>
      navItemsForRole(session.role).map((item) => {
        const navLabels = NAV_LABELS[item.key];
        return {
          ...item,
          title: navLabels ? t(navLabels.title) : item.title,
          subtitle: navLabels ? t(navLabels.subtitle) : item.subtitle,
        };
      }),
    [session.role, t],
  );
  const allowedKeys = useMemo(() => navItems.map((item) => item.key), [navItems]);
  const [current, navigate] = useHashRoute(allowedKeys, navItems[0]?.key ?? "svc-api-gateway");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [releaseHistoryOpen, setReleaseHistoryOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [globalHealth, setGlobalHealth] = useState<"healthy" | "warning" | "critical" | "unknown">("unknown");
  const [globalHealthText, setGlobalHealthText] = useState<string>("--");
  const [density, setDensity] = useState<UiDensity>(() => {
    if (typeof window === "undefined") {
      return "comfortable";
    }
    const stored = window.localStorage.getItem(UI_DENSITY_STORAGE_KEY);
    return stored === "dense" ? "dense" : "comfortable";
  });
  const currentNav = useMemo(() => navItems.find((item) => item.key === current), [current, navItems]);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const summaryBaselineRef = useRef<Record<string, { requestsTotal: number | null; fetchedAt: number }>>({});
  const releaseHistoryRef = useRef<HTMLDivElement | null>(null);
  const preferencesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!releaseHistoryOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReleaseHistoryOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [releaseHistoryOpen]);

  useEffect(() => {
    if (!preferencesOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreferencesOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preferencesOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (releaseHistoryOpen && releaseHistoryRef.current && !releaseHistoryRef.current.contains(target)) {
        setReleaseHistoryOpen(false);
      }

      if (preferencesOpen && preferencesRef.current && !preferencesRef.current.contains(target)) {
        setPreferencesOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [preferencesOpen, releaseHistoryOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
  }, [density]);

  const updateGlobalHealth = useMemo(() => {
    return async () => {
      try {
        const summary = await fetchServiceOperationalSummary(context, summaryBaselineRef.current);

        const { total, onlineCount, accessIssues, connectionErrors } = summary.totals;
        const offlineCount = Math.max(0, total - onlineCount);

        if (connectionErrors > 0) {
          setGlobalHealth("critical");
          setGlobalHealthText(`${connectionErrors} ${t("layout.header.semaphore.connectionErrors")}`);
          return;
        }

        if (accessIssues > 0 || offlineCount > 0) {
          setGlobalHealth("warning");
          setGlobalHealthText(`${onlineCount}/${total} ${t("layout.header.semaphore.online")}`);
          return;
        }

        setGlobalHealth("healthy");
        setGlobalHealthText(`${onlineCount}/${total} ${t("layout.header.semaphore.online")}`);
      } catch {
        setGlobalHealth("unknown");
        setGlobalHealthText(t("layout.header.semaphore.unknown"));
      }
    };
  }, [context, t]);

  useEffect(() => {
    void updateGlobalHealth();
  }, [updateGlobalHealth]);

  useVisibilityPolling(updateGlobalHealth, 30000);

  const toggleDensity = () => setDensity((v) => (v === "comfortable" ? "dense" : "comfortable"));
  const cycleAccent = () => {
    const index = ACCENT_OPTIONS.findIndex((item) => item.value === accent);
    const safeIndex = index >= 0 ? index : 0;
    const nextAccent = ACCENT_OPTIONS[(safeIndex + 1) % ACCENT_OPTIONS.length].value;
    onAccentChange(nextAccent);
  };

  const onNavigate = (key: NavKey) => {
    if (typeof window !== "undefined") {
      const routeBase = routeFromNavKey(key);
      let nextRoute = routeBase;

      if (SERVICE_NAV_KEYS.has(key)) {
        const savedQuery = window.localStorage.getItem(`${UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX}.${key}`);
        if (savedQuery) {
          nextRoute = `${routeBase}?${savedQuery}`;
        }
      }

      if (window.location.hash !== nextRoute) {
        window.location.hash = nextRoute;
      } else {
        navigate(key);
      }
    } else {
      navigate(key);
    }
    setMobileMenuOpen(false);
    setReleaseHistoryOpen(false);
    setPreferencesOpen(false);
  };

  const onTouchStart = (event: TouchEvent) => {
    const firstTouch = event.touches[0];
    touchStartX.current = firstTouch.clientX;
    touchStartY.current = firstTouch.clientY;
  };

  const onTouchEnd = (event: TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (startX === null || startY === null) {
      return;
    }

    const endTouch = event.changedTouches[0];
    const deltaX = endTouch.clientX - startX;
    const deltaY = endTouch.clientY - startY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    if (!mobileMenuOpen && startX <= 24 && deltaX >= 70) {
      setMobileMenuOpen(true);
      return;
    }

    if (mobileMenuOpen && deltaX <= -70) {
      setMobileMenuOpen(false);
    }
  };

  return (
    <div
      className="mx-auto grid min-h-screen w-full max-w-[1880px] gap-3 p-3 sm:gap-4 sm:p-4 xl:gap-6 xl:p-6 2xl:max-w-[2200px] 2xl:grid-cols-[340px_1fr] xl:grid-cols-[300px_1fr]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {!mobileMenuOpen && <div className="fixed left-0 top-0 z-30 h-screen w-3 lg:hidden" aria-hidden="true" />}
      <div className="m3-card sticky top-2 z-20 flex items-center justify-between gap-2 p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]"
        >
          {t("layout.mobile.menu")}
        </button>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-sm font-semibold">{currentNav?.title ?? t("layout.mobile.serviceFallback")}</p>
          <div className="flex items-center justify-end gap-2">
            <p className="truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">{session.displayName}</p>
            {typography === "xl" && (
              <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-[10px] font-semibold text-[var(--md-sys-color-on-primary-container)]">
                {t("layout.mobile.typographyXlBadge")}
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={toggleDensity} className="rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]">{density === "dense" ? t("layout.mobile.densityComfortable") : t("layout.mobile.densityDense")}</button>
        <button type="button" onClick={onToggleTheme} className="ui-switch" role="switch" aria-checked={theme === "dark"} aria-label={t("layout.mobile.themeSwitch")}>
          <span className={`ui-switch-track ${theme === "dark" ? "is-on" : ""}`}>
            <span className="ui-switch-thumb" />
          </span>
        </button>
        <button type="button" onClick={cycleAccent} className="rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]">{t("login.accent")}</button>
        <select value={typography} onChange={(event) => onTypographyChange(event.target.value as UiTypography)} className="control-input px-2 py-1 text-xs">
          {TYPOGRAPHY_OPTIONS.map((size) => (
            <option key={size} value={size}>{t(TYPOGRAPHY_LABEL_KEYS[size])}</option>
          ))}
        </select>
        <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {t("language.selectorLabel")}
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
            className="control-input ml-1 py-1"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 lg:hidden ${mobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        role="dialog"
        aria-modal="true"
      >
        <button type="button" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-black/35" aria-label={t("layout.mobile.closeMenuAria")} />
        <div
          className={`absolute left-0 top-0 h-full w-[88vw] max-w-sm p-3 transition-transform duration-200 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <Sidebar current={current} onChange={onNavigate} items={navItems} className="h-full overflow-y-auto" />
        </div>
      </div>

      <div className="relative z-30 min-w-0">
        <Sidebar current={current} onChange={onNavigate} items={navItems} className="hidden h-fit lg:block lg:sticky lg:top-4" />
      </div>

      <main className="relative z-10 min-w-0 space-y-3 overflow-visible sm:space-y-4 xl:space-y-5">
        <header className="m3-card ui-fade-in relative z-20 overflow-visible bg-[linear-gradient(120deg,color-mix(in_srgb,var(--md-sys-color-primary-container)_78%,var(--md-sys-color-surface)_22%)_0%,color-mix(in_srgb,var(--md-sys-color-surface)_88%,transparent_12%)_46%,color-mix(in_srgb,var(--md-sys-color-tertiary-container)_75%,var(--md-sys-color-surface)_25%)_100%)] p-4 xl:p-6">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--md-sys-color-on-surface-variant)]">{t("layout.header.adminConsole")}</p>
              <h1 className="m3-title text-xl sm:text-2xl xl:text-4xl">{t("layout.header.title")}</h1>
              <p className="mt-1 text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)]">
                {t("layout.header.session")}: {session.displayName} ({session.role})
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`ui-status-chip ${
                    globalHealth === "healthy"
                      ? "ui-status-chip--ok"
                      : globalHealth === "warning"
                        ? "ui-status-chip--warn"
                        : globalHealth === "critical"
                          ? "ui-status-chip--error"
                          : "ui-status-chip--neutral"
                  }`}
                >
                  {globalHealth === "healthy"
                    ? t("layout.header.semaphore.healthy")
                    : globalHealth === "warning"
                      ? t("layout.header.semaphore.warning")
                      : globalHealth === "critical"
                        ? t("layout.header.semaphore.critical")
                        : t("layout.header.semaphore.unknown")}
                </span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{globalHealthText}</span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[color:var(--md-sys-color-surface-container-low)]/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--md-sys-color-on-surface-variant)]">
                    {t("layout.release.environment")} {deploymentHistory.environment.toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {t("layout.release.version")}: {deploymentHistory.currentVersion}
                  </p>
                  <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {t("layout.release.deployedAt")}: {deploymentHistory.currentDeployedAt}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                  <div ref={releaseHistoryRef} className="relative z-30">
                    <button
                      type="button"
                      onClick={() => {
                        setReleaseHistoryOpen((currentValue) => !currentValue);
                        setPreferencesOpen(false);
                      }}
                      aria-expanded={releaseHistoryOpen}
                      aria-controls="deployment-history-panel"
                      className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]"
                    >
                      {t("layout.release.historyBtn")} ({deploymentHistory.history.length})
                    </button>

                    {releaseHistoryOpen && (
                      <div
                        id="deployment-history-panel"
                        className="absolute left-0 top-full z-40 mt-2 w-[min(34rem,calc(100vw-3rem))] rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3 shadow-xl lg:right-0 lg:left-auto"
                      >
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{t("layout.release.historyTitle")}</p>
                        <div className="mt-3 space-y-2">
                          {deploymentHistory.history.map((entry) => (
                            <article
                              key={`${entry.version}-${entry.deployedAt}`}
                              className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[color:var(--md-sys-color-surface-container-low)]/70 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{entry.version}</p>
                                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{entry.deployedAt}</p>
                              </div>
                              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{entry.summary}</p>
                              <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{entry.commitSha}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div ref={preferencesRef} className="relative z-30">
                    <button
                      type="button"
                      onClick={() => {
                        setPreferencesOpen((currentValue) => !currentValue);
                        setReleaseHistoryOpen(false);
                      }}
                      aria-expanded={preferencesOpen}
                      aria-controls="layout-preferences-panel"
                      className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]"
                    >
                      UI
                    </button>

                    {preferencesOpen && (
                      <div
                        id="layout-preferences-panel"
                        className="absolute left-0 top-full z-40 mt-2 w-[min(30rem,calc(100vw-3rem))] rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3 shadow-xl lg:right-0 lg:left-auto"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {t("login.accent")}
                            <select value={accent} onChange={(event) => onAccentChange(event.target.value as UiAccent)} className="control-input mt-1 w-full py-1.5">
                              {ACCENT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {t(ACCENT_LABEL_KEYS[option.value])}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                            {t("language.selectorLabel")}
                            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} className="control-input mt-1 w-full py-1.5">
                              {LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-[var(--md-sys-color-on-surface-variant)] sm:col-span-2">
                            {t("layout.header.typography")}
                            <select value={typography} onChange={(event) => onTypographyChange(event.target.value as UiTypography)} className="control-input mt-1 w-full py-1.5">
                              {TYPOGRAPHY_OPTIONS.map((size) => (
                                <option key={size} value={size}>{t(TYPOGRAPHY_LABEL_KEYS[size])}</option>
                              ))}
                            </select>
                          </label>
                          <button type="button" onClick={onToggleTheme} className="ui-switch justify-between rounded-xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2" role="switch" aria-checked={theme === "dark"} aria-label={t("layout.header.themeSwitch")}>
                            <span className={`ui-switch-track ${theme === "dark" ? "is-on" : ""}`}>
                              <span className="ui-switch-thumb" />
                            </span>
                            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{theme === "dark" ? t("layout.header.themeDark") : t("layout.header.themeLight")}</span>
                          </button>
                          <button type="button" onClick={toggleDensity} className="ui-switch justify-between rounded-xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2" role="switch" aria-checked={density === "dense"} aria-label={t("layout.header.densitySwitch")}>
                            <span className={`ui-switch-track ${density === "dense" ? "is-on" : ""}`}>
                              <span className="ui-switch-thumb" />
                            </span>
                            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{density === "dense" ? t("layout.header.densityDense") : t("layout.header.densityComfortable")}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button type="button" onClick={onSignOut} className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]">{t("layout.header.signOut")}</button>
                </div>
              </div>
            </div>
            <div className="flex items-start justify-end xl:pt-1">
              <img src="/axiomnode-logo.svg" alt="AxiomNode" className="h-16 w-auto object-contain sm:h-20 xl:h-24" />
            </div>
          </div>
        </header>

        <Suspense fallback={<div className="m3-card animate-pulse p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">…</div>}>
          {current === "svc-overview" && <ServiceOverviewPanel context={context} density={density} />}
          {current !== "svc-overview" && SERVICE_NAV_KEYS.has(current) && <ServiceConsolePanel key={current} navKey={current} context={context} density={density} />}
          {current === "ai-diagnostics" && roleCanModify(session.role) && <AIDiagnosticsPanel context={context} density={density} />}
          {current === "roles" && roleCanManageUsers(session.role) && <RoleManagementPanel context={context} density={density} />}
        </Suspense>
      </main>
    </div>
  );
}
