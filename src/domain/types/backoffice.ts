import type { RuntimeAuthMode } from "../../auth";

export type BackofficeRole = "SuperAdmin" | "Admin" | "Viewer" | "Gamer";

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

export type ServiceKey =
  | "api-gateway"
  | "bff-backoffice"
  | "bff-mobile"
  | "microservice-users"
  | "microservice-quiz"
  | "microservice-wordpass"
  | "ai-engine-stats"
  | "ai-engine-api";

export type DataDataset = "roles" | "leaderboard" | "history" | "processes";

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

export type LeaderboardResponse = {
  metric: "won" | "score" | "played";
  total: number;
  rows: Array<{
    userId: string;
    displayName: string;
    value: number;
  }>;
};

export type RoleItem = {
  firebaseUid: string;
  displayName: string | null;
  email: string | null;
  role: BackofficeRole;
  createdAt: string;
  updatedAt: string;
};

export type ServiceCatalogItem = {
  key: ServiceKey;
  title: string;
  domain: string;
  supportsData: boolean;
};

export type ServiceNavConfig = {
  navKey: NavKey;
  service: ServiceKey;
  title: string;
  subtitle: string;
  defaultDataset?: DataDataset;
  datasets?: Array<{ value: DataDataset; label: string }>;
};

export type HotOperationResult = {
  status: "idle" | "loading" | "done" | "error";
  message: string;
};

export type SessionContext = {
  mode: RuntimeAuthMode;
  idToken?: string;
  devUid?: string;
};

export type UiDensity = "comfortable" | "dense";
export type UiTheme = "light" | "dark";
export type UiAccent = "ocean" | "sunset" | "emerald";
export type UiTypography = "sm" | "normal" | "lg" | "xl" | "xxl";
export type UiLanguage = "es" | "en" | "fr" | "de" | "it";

export type NavItem = {
  key: NavKey;
  title: string;
  subtitle: string;
};
