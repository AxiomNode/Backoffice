import { FormEvent, useCallback, useEffect, useState } from "react";

import { backofficeAuth, type BackofficeSession } from "../../auth";
import { ADMIN_DEV_UID } from "../../application/config/runtime";
import { roleHasBackofficeAccess } from "../../application/services/rolePolicies";
import { ACCENT_OPTIONS } from "../../domain/constants/ui";
import type { BackofficeRole, SessionContext, UiAccent, UiTheme, UiTypography } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import { ACCENT_LABEL_KEYS, LANGUAGE_OPTIONS, type LabelKey } from "../../i18n/labels";

/** @module LoginGate - Authentication gate that blocks access until the user signs in. */

type LoginGateProps = {
  onAuthenticated: (session: BackofficeSession, context: SessionContext) => void;
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

/** Login screen handling Firebase and dev-mode authentication with theme/accent pickers. */
export function LoginGate({
  onAuthenticated,
  theme,
  accent,
  typography,
  onToggleTheme,
  onAccentChange,
  onTypographyChange,
}: LoginGateProps) {
  const { language, setLanguage, t } = useI18n();
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
        throw new Error(t("login.errorRoleNoAccess"));
      }

      const session: BackofficeSession = {
        isAuthenticated: true,
        displayName: mePayload.profile.displayName || mePayload.profile.email || t("login.operatorFallback"),
        email: mePayload.profile.email || undefined,
        role: resolvedRole,
        firebaseUid: mePayload.profile.firebaseUid,
        provider: context.mode,
      };

      onAuthenticated(session, context);
    },
    [onAuthenticated, t],
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
        setError(err instanceof Error ? err.message : t("login.errorAuth"));
      }
    });

    return unsubscribe;
  }, [bootstrapSession, mode, t]);

  const onClickFirebase = async () => {
    setError(null);
    setLoading(true);
    try {
      await backofficeAuth.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.errorAuth"));
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
      setError(err instanceof Error ? err.message : t("login.errorAccess"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl items-center p-4 sm:p-6 xl:max-w-3xl">
      <section className="m3-card ui-fade-in relative w-full overflow-hidden p-6 xl:p-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[color:var(--md-sys-color-primary-container)]/65 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-[color:var(--md-sys-color-tertiary-container)]/65 blur-3xl" aria-hidden="true" />

        <div className="relative mb-5 flex flex-col items-center text-center">
          <span className="brand-orb brand-orb-hero h-56 w-56 sm:h-72 sm:w-72 xl:h-80 xl:w-80">
            <img src="/axiomnode-mark.svg" alt="AxiomNode mark" className="h-[82%] w-[82%] object-contain" />
          </span>
        </div>

        <div className="relative mb-4 text-center">
          <h1 className="m3-title text-2xl xl:text-4xl">{t("login.title")}</h1>
          <p className="mt-2 text-sm xl:text-base text-[var(--md-sys-color-on-surface-variant)]">
            {t("login.subtitle")}
          </p>
        </div>

        <div className="relative mb-5 grid gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]/65 p-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--md-sys-color-surface-container)]"
          >
            {theme === "dark" ? t("login.themeToLight") : t("login.themeToDark")}
          </button>

          <label className="text-sm text-[var(--md-sys-color-on-surface)]">
            {t("layout.header.typography")}
            <select
              value={typography}
              onChange={(event) => onTypographyChange(event.target.value as UiTypography)}
              className="control-input mt-1 w-full"
            >
              {TYPOGRAPHY_OPTIONS.map((size) => (
                <option key={size} value={size}>{t(TYPOGRAPHY_LABEL_KEYS[size])}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-[var(--md-sys-color-on-surface)] sm:col-span-2">
            {t("login.accent")}
            <select
              value={accent}
              onChange={(event) => onAccentChange(event.target.value as UiAccent)}
              className="control-input mt-1 w-full"
            >
              {ACCENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(ACCENT_LABEL_KEYS[option.value])}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-[var(--md-sys-color-on-surface)] sm:col-span-2">
            {t("language.selectorLabel")}
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="control-input mt-1 w-full"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="relative">
          {mode === "firebase" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void onClickFirebase()}
              className="w-full rounded-xl bg-[var(--md-sys-color-primary)] px-4 py-3 text-base font-semibold text-[var(--md-sys-color-on-primary)] shadow-[0_10px_26px_color-mix(in_srgb,var(--md-sys-color-primary)_30%,transparent_70%)] transition hover:brightness-110"
            >
              {loading ? t("login.openingGoogle") : t("login.signInGoogle")}
            </button>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {t("login.firebaseHint")}
            </p>
          </div>
          ) : (
          <form className="space-y-3" onSubmit={onSubmitDev}>
            <label className="block text-sm">
              {t("login.devUid")}
              <input value={devUid} onChange={(event) => setDevUid(event.target.value)} className="control-input mt-1 w-full" required />
            </label>
            <button type="submit" className="w-full rounded-xl bg-[var(--md-sys-color-primary)] px-4 py-3 text-base font-semibold text-[var(--md-sys-color-on-primary)] shadow-[0_10px_26px_color-mix(in_srgb,var(--md-sys-color-primary)_30%,transparent_70%)] transition hover:brightness-110">
              {loading ? t("login.signingIn") : t("login.continue")}
            </button>
          </form>
          )}
        </div>

        {error && <p className="ui-feedback ui-feedback--error relative mt-3">{error}</p>}
      </section>
    </div>
  );
}
