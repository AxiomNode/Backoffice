import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { createPortal } from "react-dom";

import type { BackofficeSession } from "../../auth";
import { fetchServiceOperationalSummary } from "../../application/services/operationalSummary";
import deploymentHistory from "../../data/deployment-history.json";
import { navItemsForRole, roleCanManageUsers, roleCanModify } from "../../application/services/rolePolicies";
import { SERVICE_NAV_KEYS } from "../../domain/constants/navigation";
import { UI_DENSITY_STORAGE_KEY, UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../../domain/constants/ui";
import type { NavKey, SessionContext, UiDensity, UiTheme, UiTypography } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";
import { LANGUAGE_OPTIONS, type LabelKey } from "../../i18n/labels";
import { useHashRoute, routeFromNavKey } from "../hooks/useHashRoute";
import { useMaxWidth } from "../hooks/useMaxWidth";
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
  typography: UiTypography;
  onToggleTheme: () => void;
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

function clampPopoverToViewport(trigger: HTMLElement, preferredWidth: number, preferredMaxHeight: number): CSSProperties | null {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isCompactViewport = viewportWidth < 640;
  const margin = isCompactViewport ? 8 : 12;
  const gap = isCompactViewport ? 6 : 8;
  const triggerRect = trigger.getBoundingClientRect();
  const hasMeasurableBounds = triggerRect.width > 0 || triggerRect.height > 0;

  const triggerIsVisible =
    !hasMeasurableBounds ||
    (triggerRect.bottom > margin &&
      triggerRect.top < viewportHeight - margin &&
      triggerRect.right > margin &&
      triggerRect.left < viewportWidth - margin);

  if (!triggerIsVisible) {
    return null;
  }

  const maxWidth = viewportWidth - margin * 2;
  const mobilePreferredWidth = Math.max(280, maxWidth);
  const width = Math.min(isCompactViewport ? mobilePreferredWidth : preferredWidth, maxWidth);

  let left = triggerRect.left;
  if (left + width > viewportWidth - margin) {
    left = viewportWidth - margin - width;
  }
  if (left < margin) {
    left = margin;
  }

  const top = triggerRect.bottom + gap;
  const availableHeight = viewportHeight - top - margin;

  if (availableHeight <= 0) {
    return null;
  }

  const maxHeight = Math.min(preferredMaxHeight, availableHeight);

  return {
    left,
    maxHeight,
    position: "fixed",
    top,
    width,
    zIndex: 140,
  };
}

function releaseHistoryPreferredWidth(): number {
  const viewportWidth = window.innerWidth;

  if (viewportWidth >= 1280) {
    return 544;
  }

  if (viewportWidth >= 768) {
    return 468;
  }

  return 420;
}

function releaseHistoryPreferredMaxHeight(): number {
  return window.innerWidth < 640 ? 448 : 576;
}

/** Main backoffice layout with sidebar navigation, preferences, and routed panel content. */
export function BackofficeLayout({
  session,
  context,
  onSignOut,
  theme,
  typography,
  onToggleTheme,
  onTypographyChange,
}: BackofficeLayoutProps) {
  const { language, setLanguage, t } = useI18n();
  const compactViewport = useMaxWidth(420);
  const narrowViewport = useMaxWidth(380);
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
  const releaseHistoryButtonRef = useRef<HTMLButtonElement | null>(null);
  const preferencesButtonRef = useRef<HTMLButtonElement | null>(null);
  const releaseHistoryPopoverRef = useRef<HTMLDivElement | null>(null);
  const preferencesPopoverRef = useRef<HTMLDivElement | null>(null);
  const [releaseHistoryStyle, setReleaseHistoryStyle] = useState<CSSProperties | undefined>(undefined);
  const [preferencesStyle, setPreferencesStyle] = useState<CSSProperties | undefined>(undefined);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
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

      const insideReleaseHistory =
        !!releaseHistoryButtonRef.current?.contains(target) || !!releaseHistoryPopoverRef.current?.contains(target);
      const insidePreferences =
        !!preferencesButtonRef.current?.contains(target) || !!preferencesPopoverRef.current?.contains(target);

      if (releaseHistoryOpen && !insideReleaseHistory) {
        setReleaseHistoryOpen(false);
      }

      if (preferencesOpen && !insidePreferences) {
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

  useEffect(() => {
    if (!releaseHistoryOpen || !releaseHistoryButtonRef.current) {
      setReleaseHistoryStyle(undefined);
      return;
    }

    const updatePosition = () => {
      if (!releaseHistoryButtonRef.current) {
        return;
      }
      const nextStyle = clampPopoverToViewport(
        releaseHistoryButtonRef.current,
        releaseHistoryPreferredWidth(),
        releaseHistoryPreferredMaxHeight(),
      );
      if (!nextStyle) {
        setReleaseHistoryOpen(false);
        return;
      }
      setReleaseHistoryStyle(nextStyle);
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && releaseHistoryPopoverRef.current?.contains(target)) {
        return;
      }
      setReleaseHistoryOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [releaseHistoryOpen]);

  useEffect(() => {
    if (!preferencesOpen || !preferencesButtonRef.current) {
      setPreferencesStyle(undefined);
      return;
    }

    const updatePosition = () => {
      if (!preferencesButtonRef.current) {
        return;
      }
      const nextStyle = clampPopoverToViewport(preferencesButtonRef.current, 480, 480);
      if (!nextStyle) {
        setPreferencesOpen(false);
        return;
      }
      setPreferencesStyle(nextStyle);
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && preferencesPopoverRef.current?.contains(target)) {
        return;
      }
      setPreferencesOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [preferencesOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [current]);

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

  const canRenderFloatingPanels = typeof document !== "undefined";

  return (
    <div
      className="mx-auto grid min-h-screen w-full max-w-[1880px] overflow-x-clip gap-3 p-3 sm:gap-4 sm:p-4 xl:gap-6 xl:p-6 2xl:max-w-[2200px] 2xl:grid-cols-[340px_1fr] xl:grid-cols-[300px_1fr]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {!mobileMenuOpen && <div className="fixed left-0 top-0 z-30 h-screen w-3 xl:hidden" aria-hidden="true" />}
      <div className={`m3-card sticky top-2 z-40 overflow-hidden xl:hidden ${narrowViewport ? "space-y-2 p-2" : compactViewport ? "space-y-2 p-2.5" : "space-y-2.5 p-2.5"}`}>
        <div className={`flex items-start ${narrowViewport ? "gap-2" : "gap-3"}`}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`shrink-0 rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] ${narrowViewport ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
          >
            {t("layout.mobile.menu")}
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className={`truncate font-semibold ${narrowViewport ? "text-xs" : "text-sm"}`}>{currentNav?.title ?? t("layout.mobile.serviceFallback")}</p>
            <div className={`mt-1 flex items-center justify-end ${narrowViewport ? "gap-1.5" : "gap-2"}`}>
              <p className={`truncate text-[var(--md-sys-color-on-surface-variant)] ${narrowViewport ? "text-[11px]" : "text-xs"}`}>{session.displayName}</p>
              {typography === "xl" && (
                <span className={`shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] font-semibold text-[var(--md-sys-color-on-primary-container)] ${narrowViewport ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}>
                  {t("layout.mobile.typographyXlBadge")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={`flex flex-wrap items-center justify-end ${narrowViewport ? "gap-1.5" : "gap-2"}`}>
          <button type="button" onClick={toggleDensity} className={`rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] ${narrowViewport ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs"}`}>{density === "dense" ? t("layout.mobile.densityComfortable") : t("layout.mobile.densityDense")}</button>
          <button type="button" onClick={onToggleTheme} className="ui-switch shrink-0" role="switch" aria-checked={theme === "dark"} aria-label={t("layout.mobile.themeSwitch")}>
            <span className={`ui-switch-track ${theme === "dark" ? "is-on" : ""}`}>
              <span className="ui-switch-thumb" />
            </span>
          </button>
          <select
            value={typography}
            onChange={(event) => onTypographyChange(event.target.value as UiTypography)}
            aria-label={t("layout.header.typography")}
            className={`control-input px-2 py-1 ${narrowViewport ? "min-w-[4.25rem] text-[11px]" : "min-w-[4.75rem] text-xs"}`}
          >
            {TYPOGRAPHY_OPTIONS.map((size) => (
              <option key={size} value={size}>{t(TYPOGRAPHY_LABEL_KEYS[size])}</option>
            ))}
          </select>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
            aria-label={t("language.selectorLabel")}
            className={`control-input px-2 py-1 ${narrowViewport ? "max-w-[7rem] min-w-[5rem] text-[11px]" : "max-w-[8.5rem] min-w-[5.5rem] text-xs"}`}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[70] xl:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 z-0 bg-black/35"
            aria-label={t("layout.mobile.closeMenuAria")}
          />
          <div
            className="absolute left-0 top-0 z-10 h-full w-[88vw] max-w-sm p-3 transition-transform duration-200 translate-x-0"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Sidebar current={current} onChange={onNavigate} items={navItems} className="h-full overflow-y-auto" />
          </div>
        </div>
      )}

      <div className="relative z-10 min-w-0 xl:z-0">
        <Sidebar current={current} onChange={onNavigate} items={navItems} className="hidden h-fit xl:block xl:sticky xl:top-4" />
      </div>

      <main className={`relative z-20 min-w-0 overflow-visible ${compactViewport ? "space-y-2.5" : "space-y-3 sm:space-y-4 xl:space-y-4"}`}>
        <header className={`m3-card ui-fade-in relative z-30 overflow-visible bg-[linear-gradient(125deg,color-mix(in_srgb,var(--md-sys-color-primary-container)_62%,var(--md-sys-color-surface)_38%)_0%,color-mix(in_srgb,var(--md-sys-color-surface-container-low)_95%,transparent_5%)_56%,color-mix(in_srgb,var(--md-sys-color-surface-container)_90%,var(--md-sys-color-secondary-container)_10%)_100%)] ${narrowViewport ? "p-3" : compactViewport ? "p-3.5" : "p-4 xl:p-5"}`}>
          <div className={`grid ${compactViewport ? "gap-3" : "gap-4"} xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start`}>
            <div className={`min-w-0 ${compactViewport ? "space-y-3" : "space-y-3.5"}`}>
              <div className={`flex flex-wrap items-start justify-between ${compactViewport ? "gap-3" : "gap-4 xl:gap-6"}`}>
                <div className="min-w-0 flex-1">
                  <p className={`uppercase text-[var(--md-sys-color-on-surface-variant)] ${narrowViewport ? "text-[10px] tracking-[0.18em]" : "text-[11px] tracking-[0.24em]"}`}>{t("layout.header.adminConsole")}</p>
                  <h1 className={`m3-title mt-2 ${narrowViewport ? "text-lg leading-6" : compactViewport ? "text-xl leading-7" : "text-xl sm:text-2xl xl:text-4xl"}`}>{t("layout.header.title")}</h1>
                  <p className={`mt-1.5 max-w-3xl text-[var(--md-sys-color-on-surface-variant)] ${narrowViewport ? "text-[11px] leading-4" : compactViewport ? "text-xs leading-5" : "text-xs sm:text-sm xl:text-[0.95rem]"}`}>
                    {t("layout.header.session")}: {session.displayName} ({session.role})
                  </p>
                </div>

                <div className={`ui-subtle-card flex w-full min-w-0 flex-col items-start rounded-[1.35rem] ${narrowViewport ? "p-2.5" : "p-3 sm:p-3.5"} sm:w-auto sm:min-w-[10.5rem] xl:min-w-[12rem]`}>
                  <p className={`uppercase tracking-[0.18em] text-[var(--md-sys-color-on-surface-variant)] ${narrowViewport ? "text-[10px]" : "text-[11px]"}`}>
                    {t("layout.release.environment")} {deploymentHistory.environment.toUpperCase()}
                  </p>
                  <p className={`mt-2 font-semibold text-[var(--md-sys-color-on-surface)] ${narrowViewport ? "text-xs" : "text-sm sm:text-base"}`}>
                    {t("layout.release.version")}: {deploymentHistory.currentVersion}
                  </p>
                  <p className={`mt-1 text-[var(--md-sys-color-on-surface-variant)] ${narrowViewport ? "text-[11px] leading-4" : "text-xs leading-5"}`}>
                    {t("layout.release.deployedAt")}: {deploymentHistory.currentDeployedAt}
                  </p>
                </div>
              </div>

              <div className={`flex flex-wrap items-center ${compactViewport ? "gap-2" : "gap-2.5"}`}>
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
                <span className={`${narrowViewport ? "text-[11px]" : "text-xs sm:text-sm"} text-[var(--md-sys-color-on-surface-variant)]`}>{globalHealthText}</span>
              </div>

              <div className={`flex flex-wrap items-center ${compactViewport ? "gap-2" : "gap-2.5"}`}>
                  <div className="relative z-30">
                    <button
                      ref={releaseHistoryButtonRef}
                      type="button"
                      onClick={() => {
                        setReleaseHistoryOpen((currentValue) => !currentValue);
                        setPreferencesOpen(false);
                      }}
                      aria-expanded={releaseHistoryOpen}
                      aria-controls="deployment-history-panel"
                      className={`ui-action-pill ui-action-pill--tonal ${narrowViewport ? "px-3 py-1.5 text-[11px]" : "text-xs"}`}
                    >
                      {t("layout.release.historyBtn")} ({deploymentHistory.history.length})
                    </button>

                    {releaseHistoryOpen &&
                      releaseHistoryStyle &&
                      canRenderFloatingPanels &&
                      createPortal(
                        <div
                          id="deployment-history-panel"
                          ref={releaseHistoryPopoverRef}
                          style={releaseHistoryStyle}
                          className="ui-popover-panel overflow-hidden rounded-[1.75rem] p-4"
                        >
                          <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{t("layout.release.historyTitle")}</p>
                          <div className="mt-3 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: releaseHistoryStyle.maxHeight ? Math.max(120, Number(releaseHistoryStyle.maxHeight) - 76) : undefined }}>
                            {deploymentHistory.history.map((entry) => (
                              <article
                                key={`${entry.version}-${entry.deployedAt}`}
                                className="ui-subtle-card rounded-2xl px-3 py-3"
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
                        </div>,
                        document.body,
                      )}
                  </div>

                  <div className="relative z-30">
                    <button
                      ref={preferencesButtonRef}
                      type="button"
                      onClick={() => {
                        setPreferencesOpen((currentValue) => !currentValue);
                        setReleaseHistoryOpen(false);
                      }}
                      aria-expanded={preferencesOpen}
                      aria-controls="layout-preferences-panel"
                      className={`ui-action-pill ui-action-pill--tonal ${narrowViewport ? "px-3 py-1.5 text-[11px]" : "text-xs"}`}
                    >
                      UI
                    </button>

                    {preferencesOpen &&
                      preferencesStyle &&
                      canRenderFloatingPanels &&
                      createPortal(
                        <div
                          id="layout-preferences-panel"
                          ref={preferencesPopoverRef}
                          style={preferencesStyle}
                          className="ui-popover-panel overflow-y-auto rounded-[1.75rem] p-4"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
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
                            <button type="button" onClick={onToggleTheme} className="ui-switch justify-between rounded-2xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5" role="switch" aria-checked={theme === "dark"} aria-label={t("layout.header.themeSwitch")}>
                              <span className={`ui-switch-track ${theme === "dark" ? "is-on" : ""}`}>
                                <span className="ui-switch-thumb" />
                              </span>
                              <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{theme === "dark" ? t("layout.header.themeDark") : t("layout.header.themeLight")}</span>
                            </button>
                            <button type="button" onClick={toggleDensity} className="ui-switch justify-between rounded-2xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5" role="switch" aria-checked={density === "dense"} aria-label={t("layout.header.densitySwitch")}>
                              <span className={`ui-switch-track ${density === "dense" ? "is-on" : ""}`}>
                                <span className="ui-switch-thumb" />
                              </span>
                              <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{density === "dense" ? t("layout.header.densityDense") : t("layout.header.densityComfortable")}</span>
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )}
                  </div>

                  <button type="button" onClick={onSignOut} className={`ui-action-pill ui-action-pill--quiet ${narrowViewport ? "px-3 py-1.5 text-xs" : "text-sm"}`}>{t("layout.header.signOut")}</button>
              </div>
            </div>
            <div className={`${compactViewport ? "hidden" : "flex"} items-start justify-start xl:justify-end xl:pt-1`}>
              <div className="ui-subtle-card flex items-center justify-center rounded-[1.5rem] px-3 py-3 sm:px-4 xl:px-5">
                <img src="/axiomnode-logo.svg" alt="AxiomNode" className="h-10 w-auto object-contain sm:h-12 xl:h-14" />
              </div>
            </div>
          </div>
        </header>

        <Suspense fallback={<div className="m3-card animate-pulse p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">…</div>}>
          {/** La ruta ai-diagnostics mantiene el laboratorio IA dedicado; las paginas svc-* usan consola unificada por servicio. */}
          {(() => {
            const showAiDiagnostics = current === "ai-diagnostics" && roleCanModify(session.role);

            return (
              <>
                {current === "svc-overview" && <ServiceOverviewPanel context={context} density={density} />}
                {current !== "svc-overview" && SERVICE_NAV_KEYS.has(current) && !showAiDiagnostics && (
                  <ServiceConsolePanel key={current} navKey={current} context={context} density={density} />
                )}
                {showAiDiagnostics && <AIDiagnosticsPanel context={context} density={density} />}
                {current === "roles" && roleCanManageUsers(session.role) && <RoleManagementPanel context={context} density={density} />}
              </>
            );
          })()}
        </Suspense>
      </main>
    </div>
  );
}
