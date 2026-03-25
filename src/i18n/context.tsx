import { createContext, useCallback, useContext, type ReactNode } from "react";

import type { UiLanguage } from "../domain/types/backoffice";
import { interpolate, type LabelKey, resolveLabel } from "./labels";

type I18nContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: LabelKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  children: ReactNode;
};

export function I18nProvider({ language, setLanguage, children }: I18nProviderProps) {
  const t = useCallback(
    (key: LabelKey, params?: Record<string, string | number>) => {
      return interpolate(resolveLabel(language, key), params);
    },
    [language],
  );

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
