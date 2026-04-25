import { FormEvent, useCallback, useEffect, useState } from "react";

import { backofficeAuth, type BackofficeSession } from "../../auth";
import { ADMIN_DEV_UID } from "../../application/config/runtime";
import { roleHasBackofficeAccess } from "../../application/services/rolePolicies";
import type { BackofficeRole, SessionContext, UiTheme, UiTypography } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import type { LabelKey } from "../../i18n/labels";

/** @module LoginGate - Authentication gate that blocks access until the user signs in. */

type LoginGateProps = {
  onAuthenticated: (session: BackofficeSession, context: SessionContext) => void;
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

function resolveFirebaseLoginError(err: unknown, t: (key: LabelKey) => string): string {
  const code =
    typeof err === "object" && err !== null && "code" in err && typeof (err as { code?: unknown }).code === "string"
      ? ((err as { code: string }).code || "").toLowerCase()
      : "";

  switch (code) {
    case "auth/unauthorized-domain":
      return t("login.errorUnauthorizedDomain");
    case "auth/popup-blocked":
      return t("login.errorPopupBlocked");
    case "auth/popup-closed-by-user":
      return t("login.errorPopupClosed");
    case "auth/operation-not-allowed":
      return t("login.errorOperationNotAllowed");
    case "auth/network-request-failed":
      return t("login.errorNetwork");
    case "auth/too-many-requests":
      return t("login.errorTooManyRequests");
    default:
      if (err instanceof Error && err.message.trim().length > 0) {
        return err.message;
      }
      return t("login.errorAuth");
  }
}

/** Login screen handling Firebase and dev-mode authentication with theme and typography preferences. */
export function LoginGate({
  onAuthenticated,
  theme,
  typography,
  onToggleTheme,
  onTypographyChange,
}: LoginGateProps) {
  const { t } = useI18n();
  const mode = backofficeAuth.mode;
  const [devUid, setDevUid] = useState(ADMIN_DEV_UID);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authResolved, setAuthResolved] = useState(mode !== "firebase");
  const [restoringSession, setRestoringSession] = useState(mode === "firebase");

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
        setRestoringSession(false);
        setAuthResolved(true);
        return;
      }

      try {
        await bootstrapSession({ mode: "firebase", idToken: runtimeSession.idToken });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("login.errorAuth"));
      } finally {
        setRestoringSession(false);
        setAuthResolved(true);
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
      setError(resolveFirebaseLoginError(err, t));
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

  if (mode === "firebase" && !authResolved) {
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

          <div className="relative text-center">
            <h1 className="m3-title text-2xl xl:text-4xl">{t("login.restoringSession")}</h1>
            <p className="mt-2 text-sm xl:text-base text-[var(--md-sys-color-on-surface-variant)]">
              {t("login.restoringSessionHint")}
            </p>
          </div>

          <div className="relative mx-auto mt-6 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-high)]">
            <div className="h-full w-1/3 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-[var(--md-sys-color-primary)]" />
          </div>

          {restoringSession && error && <p className="ui-feedback ui-feedback--error relative mt-4">{error}</p>}
        </section>
      </div>
    );
  }

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
