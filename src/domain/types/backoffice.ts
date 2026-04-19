import type { RuntimeAuthMode } from "../../auth";

/** @module backoffice - Core domain types for the backoffice application. */

/** User role within the backoffice RBAC system. */
export type BackofficeRole = "SuperAdmin" | "Admin" | "Viewer" | "Gamer";

/** Navigation key identifying a sidebar destination. */
export type NavKey =
  | "svc-overview"
  | "svc-api-gateway"
  | "svc-bff-backoffice"
  | "svc-bff-mobile"
  | "svc-users"
  | "svc-quiz"
  | "svc-wordpass"
  | "svc-ai-stats"
  | "svc-ai-api"
  | "ai-diagnostics"
  | "hotfix"
  | "roles";

/** Backend service identifier used in API calls. */
export type ServiceKey =
  | "api-gateway"
  | "bff-backoffice"
  | "bff-mobile"
  | "microservice-users"
  | "microservice-quiz"
  | "microservice-wordpass"
  | "ai-engine-stats"
  | "ai-engine-api";

/** Available dataset tabs for services that expose data endpoints. */
export type DataDataset = "roles" | "leaderboard" | "history" | "processes";

/** Aggregated stats payload returned by a service health endpoint. */
export type StatsPayload = {
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

/** Leaderboard response shape from the users microservice. */
export type LeaderboardResponse = {
  metric: "won" | "score" | "played";
  total: number;
  rows: Array<{
    userId: string;
    displayName: string;
    value: number;
  }>;
};

/** A single user-role record from the admin endpoint. */
export type RoleItem = {
  firebaseUid: string;
  displayName: string | null;
  email: string | null;
  role: BackofficeRole;
  createdAt: string;
  updatedAt: string;
};

/** Catalog entry representing a registered microservice. */
export type ServiceCatalogItem = {
  key: ServiceKey;
  title: string;
  domain: string;
  supportsData: boolean;
};

/** Navigation config that maps a nav key to its service and optional datasets. */
export type ServiceNavConfig = {
  navKey: NavKey;
  service: ServiceKey;
  title: string;
  subtitle: string;
  defaultDataset?: DataDataset;
  datasets?: Array<{ value: DataDataset; label: string }>;
};

/** Result state for hotfix / runtime operations. */
export type HotOperationResult = {
  status: "idle" | "loading" | "done" | "error";
  message: string;
};

/** Active session context passed to API calls. */
export type SessionContext = {
  mode: RuntimeAuthMode;
  idToken?: string;
  devUid?: string;
};

/** Layout density preference. */
export type UiDensity = "comfortable" | "dense";
/** Color theme preference. */
export type UiTheme = "light" | "dark";
/** Color accent variant. */
export type UiAccent = "ocean" | "sunset" | "emerald";
/** Typography scale preference. */
export type UiTypography = "sm" | "normal" | "lg" | "xl" | "xxl";
/** Supported UI languages. */
export type UiLanguage = "es" | "en" | "fr" | "de" | "it";

/** Functional grouping for sidebar navigation. */
export type NavSectionKey = "overview" | "platform" | "games" | "ai" | "admin";

/** Runtime ai-engine target state exposed by the backoffice BFF. */
export type AiEngineTarget = {
  source: "env" | "override";
  label: string | null;
  host: string | null;
  protocol: "http" | "https" | null;
  port: number | null;
  llamaBaseUrl: string | null;
  envLlamaBaseUrl: string | null;
  updatedAt: string | null;
};

/** Shared ai-engine destination preset stored by the backoffice BFF. */
export type AiEngineTargetPreset = {
  id: string;
  name: string;
  host: string;
  protocol: "http" | "https";
  port: number;
  updatedAt: string;
};

/** Sidebar navigation item displayed to the user. */
export type NavItem = {
  key: NavKey;
  section: NavSectionKey;
  title: string;
  subtitle: string;
};
