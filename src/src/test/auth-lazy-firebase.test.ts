import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const state = { loaded: 0, listener: null as null | ((user: unknown) => Promise<void>) };
  return {
    state,
    unsubscribe: vi.fn(),
    signInWithPopup: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
});

vi.mock("firebase/app", () => {
  sdk.state.loaded += 1;
  return { initializeApp: vi.fn(() => ({ name: "app" })) };
});

vi.mock("firebase/auth", () => {
  sdk.state.loaded += 1;
  return {
    GoogleAuthProvider: class {},
    getAuth: vi.fn(() => ({ name: "auth" })),
    onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => Promise<void>) => {
      sdk.state.listener = cb;
      return sdk.unsubscribe;
    }),
    signInWithPopup: sdk.signInWithPopup,
    signOut: sdk.signOut,
  };
});

async function importAuth(config: Record<string, string>) {
  vi.resetModules();
  sdk.state.loaded = 0;
  (window as unknown as { __AXIOMNODE_CONFIG__?: Record<string, string> }).__AXIOMNODE_CONFIG__ = config;
  return import("../auth");
}

const FIREBASE_CONFIG = {
  VITE_AUTH_MODE: "firebase",
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "project",
};

describe("BackofficeAuth lazy Firebase loading", () => {
  beforeEach(() => {
    sdk.unsubscribe.mockClear();
    sdk.signInWithPopup.mockClear();
    sdk.signOut.mockClear();
    sdk.state.listener = null;
  });

  afterEach(() => {
    delete (window as unknown as { __AXIOMNODE_CONFIG__?: unknown }).__AXIOMNODE_CONFIG__;
  });

  it("never loads the Firebase SDK in dev auth mode", async () => {
    const { backofficeAuth } = await importAuth({ VITE_AUTH_MODE: "dev" });
    const handler = vi.fn();

    expect(backofficeAuth.mode).toBe("dev");
    backofficeAuth.onSessionChanged(handler)();
    await backofficeAuth.signOut();
    await expect(backofficeAuth.signInWithGoogle()).rejects.toThrow("not configured");

    expect(handler).toHaveBeenCalledWith(null);
    expect(sdk.state.loaded).toBe(0);
  });

  it("stays in dev mode when firebase is selected but not configured", async () => {
    const { backofficeAuth } = await importAuth({ VITE_AUTH_MODE: "firebase" });
    expect(backofficeAuth.mode).toBe("dev");
    expect(sdk.state.loaded).toBe(0);
  });

  it("reports firebase mode without loading the SDK until it is used", async () => {
    const { backofficeAuth } = await importAuth(FIREBASE_CONFIG);
    expect(backofficeAuth.mode).toBe("firebase");
    expect(sdk.state.loaded).toBe(0);

    await backofficeAuth.signInWithGoogle();
    expect(sdk.state.loaded).toBe(2);
    expect(sdk.signInWithPopup).toHaveBeenCalledTimes(1);

    await backofficeAuth.signOut();
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });

  it("forwards session changes and unsubscribes", async () => {
    const { backofficeAuth } = await importAuth(FIREBASE_CONFIG);
    const handler = vi.fn();
    const stop = backofficeAuth.onSessionChanged(handler);

    await vi.waitFor(() => expect(sdk.state.listener).not.toBeNull());
    await sdk.state.listener?.(null);
    await sdk.state.listener?.({
      email: "a@example.com",
      displayName: "Ada",
      getIdTokenResult: async () => ({ token: "tok" }),
    });

    expect(handler).toHaveBeenNthCalledWith(1, null);
    expect(handler).toHaveBeenNthCalledWith(2, { idToken: "tok", email: "a@example.com", displayName: "Ada" });

    stop();
    expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe if disposed before the SDK finished loading", async () => {
    const { backofficeAuth } = await importAuth(FIREBASE_CONFIG);
    const stop = backofficeAuth.onSessionChanged(vi.fn());
    stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sdk.state.listener).toBeNull();
  });
});
