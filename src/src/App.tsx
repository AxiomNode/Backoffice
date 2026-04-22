import { useEffect, useState } from "react";

import { backofficeAuth, type BackofficeSession } from "./auth";
import { clearPrefixedStorageEntries } from "./application/services/sessionStorage";
import {
  UI_LANGUAGE_STORAGE_KEY,
  UI_SERVICE_LAST_ERROR_STORAGE_PREFIX,
  UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX,
  UI_THEME_STORAGE_KEY,
  UI_TYPOGRAPHY_STORAGE_KEY,
} from "./domain/constants/ui";
import type { SessionContext } from "./domain/types/backoffice";
import type { UiLanguage, UiTheme, UiTypography } from "./domain/types/backoffice";
import { I18nProvider } from "./i18n/context";
import { BackofficeLayout } from "./ui/layout/BackofficeLayout";
import { LoginGate } from "./ui/panels/LoginGate";

/** @module App - Root component that manages auth state, theming, and top-level routing. */

/** Root application component that gates login and renders the backoffice layout. */
export function App() {
  const [session, setSession] = useState<BackofficeSession | null>(null);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [theme, setTheme] = useState<UiTheme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [typography, setTypography] = useState<UiTypography>(() => {
    if (typeof window === "undefined") {
      return "normal";
    }
    const stored = window.localStorage.getItem(UI_TYPOGRAPHY_STORAGE_KEY);
    if (stored === "sm" || stored === "normal" || stored === "lg" || stored === "xl" || stored === "xxl") {
      return stored;
    }
    return "normal";
  });
  const [language, setLanguage] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") {
      return "es";
    }
    const stored = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (stored === "es" || stored === "en" || stored === "fr" || stored === "de" || stored === "it") {
      return stored;
    }
    return "es";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_TYPOGRAPHY_STORAGE_KEY, typography);
    document.documentElement.setAttribute("data-typography", typography);
  }, [typography]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  const toggleTheme = () => setTheme((value) => (value === "light" ? "dark" : "light"));
  const handleAuthenticated = (nextSession: BackofficeSession, nextContext: SessionContext) => {
    setSession(nextSession);
    setContext(nextContext);
  };

  const handleSignOut = async () => {
    await backofficeAuth.signOut();

    if (typeof window !== "undefined") {
      clearPrefixedStorageEntries(
        [`${UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX}.`, `${UI_SERVICE_LAST_ERROR_STORAGE_PREFIX}.`],
        window.localStorage,
      );
    }

    setSession(null);
    setContext(null);
  };

  if (!session || !context) {
    return (
      <I18nProvider language={language} setLanguage={setLanguage}>
        <LoginGate
          onAuthenticated={handleAuthenticated}
          theme={theme}
          typography={typography}
          onToggleTheme={toggleTheme}
          onTypographyChange={setTypography}
        />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={language} setLanguage={setLanguage}>
      <BackofficeLayout
        session={session}
        context={context}
        onSignOut={handleSignOut}
        theme={theme}
        typography={typography}
        onToggleTheme={toggleTheme}
        onTypographyChange={setTypography}
      />
    </I18nProvider>
  );
}
