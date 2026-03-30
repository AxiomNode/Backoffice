import type { UiAccent } from "../types/backoffice";

export const UI_DENSITY_STORAGE_KEY = "backoffice.uiDensity";
export const UI_THEME_STORAGE_KEY = "backoffice.uiTheme";
export const UI_ACCENT_STORAGE_KEY = "backoffice.uiAccent";
export const UI_TYPOGRAPHY_STORAGE_KEY = "backoffice.uiTypography";
export const UI_LANGUAGE_STORAGE_KEY = "backoffice.uiLanguage";
export const UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX = "backoffice.serviceRouteQuery";
export const UI_SERVICE_LAST_ERROR_STORAGE_PREFIX = "backoffice.serviceLastError";
export const UI_SERVICE_GENERATION_FOLLOW_STORAGE_PREFIX = "backoffice.serviceGenerationFollow";

export const ACCENT_OPTIONS: Array<{ value: UiAccent; label: string }> = [
  { value: "ocean", label: "Océano" },
  { value: "sunset", label: "Sunset" },
  { value: "emerald", label: "Esmeralda" },
];
