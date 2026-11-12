import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { UiLanguage } from "../domain/types/backoffice";
import { interpolate, type LabelDictionary, type LabelKey, getLoadedDictionary, loadDictionary, resolveLabel } from "./labels";

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

/**
 * Provides translations to the tree. English is bundled; any other language is fetched on demand
 * (separate chunk) and English text is shown until it arrives. The context value is memoized so
 * consumers only re-render when the language, the setter or the loaded dictionary changes.
 */
export function I18nProvider({ language, setLanguage, children }: I18nProviderProps) {
  const [loaded, setLoaded] = useState<{ language: UiLanguage; dictionary: LabelDictionary } | null>(null);

  useEffect(() => {
    if (getLoadedDictionary(language)) {
      return;
    }
    let cancelled = false;
    void loadDictionary(language).then((dictionary) => {
      if (!cancelled) {
        setLoaded({ language, dictionary });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const dictionary = getLoadedDictionary(language) ?? (loaded?.language === language ? loaded.dictionary : null);

  const t = useCallback(
    (key: LabelKey, params?: Record<string, string | number>) => {
      return interpolate(resolveLabel(dictionary, key), params);
    },
    [dictionary],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
