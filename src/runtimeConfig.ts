type RuntimeConfig = {
  VITE_API_BASE_URL?: string;
  VITE_EDGE_API_TOKEN?: string;
  VITE_AUTH_MODE?: string;
  VITE_ADMIN_DEV_UID?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
};

declare global {
  interface Window {
    __AXIOMNODE_CONFIG__?: RuntimeConfig;
  }
}

function fromRuntime(key: keyof RuntimeConfig): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__AXIOMNODE_CONFIG__?.[key];
}

function fromVite(key: keyof RuntimeConfig): string | undefined {
  return import.meta.env[key];
}

export function getConfigValue(key: keyof RuntimeConfig, fallback?: string): string | undefined {
  return fromRuntime(key) ?? fromVite(key) ?? fallback;
}
