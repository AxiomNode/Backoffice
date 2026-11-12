import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import { getConfigValue } from "./runtimeConfig";

/** @module auth - Firebase and dev-mode authentication for the backoffice shell. */

/** Authentication provider mode: Firebase or local dev bypass. */
export type RuntimeAuthMode = "firebase" | "dev";

/** Authenticated session state exposed to the rest of the app. */
export type BackofficeSession = {
  isAuthenticated: boolean;
  displayName: string;
  email?: string;
  role: "SuperAdmin" | "Admin" | "Inspector" | "Viewer" | "Gamer";
  firebaseUid: string;
  provider: RuntimeAuthMode;
};

/** Lightweight session payload obtained from the auth provider. */
export type RuntimeSession = {
  idToken?: string;
  email?: string;
  displayName?: string;
};

const AUTH_MODE = (getConfigValue("VITE_AUTH_MODE", "dev") ?? "dev") as RuntimeAuthMode;

const firebaseConfig = {
  apiKey: getConfigValue("VITE_FIREBASE_API_KEY"),
  authDomain: getConfigValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getConfigValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getConfigValue("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getConfigValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getConfigValue("VITE_FIREBASE_APP_ID"),
  measurementId: getConfigValue("VITE_FIREBASE_MEASUREMENT_ID"),
};

function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

type FirebaseRuntime = {
  auth: Auth;
  googleProvider: GoogleAuthProvider;
  sdk: typeof import("firebase/auth");
};

/**
 * Wraps Firebase Auth (or dev-mode stub) for Google sign-in and session tracking.
 * The Firebase SDK is loaded with a dynamic import only when real Firebase auth is configured,
 * so dev-auth builds never download it.
 */
export class BackofficeAuth {
  private readonly firebaseEnabled = AUTH_MODE === "firebase" && isFirebaseConfigured();
  private runtime: Promise<FirebaseRuntime> | null = null;

  get mode(): RuntimeAuthMode {
    return this.firebaseEnabled ? "firebase" : "dev";
  }

  private loadRuntime(): Promise<FirebaseRuntime> {
    if (!this.runtime) {
      this.runtime = (async () => {
        const [{ initializeApp }, sdk] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
        const app = initializeApp(firebaseConfig);
        return { auth: sdk.getAuth(app), googleProvider: new sdk.GoogleAuthProvider(), sdk };
      })();
      // Allow a retry after a transient chunk-load failure.
      this.runtime.catch(() => {
        this.runtime = null;
      });
    }
    return this.runtime;
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.firebaseEnabled) {
      throw new Error("Firebase auth is not configured in this environment.");
    }
    const { auth, googleProvider, sdk } = await this.loadRuntime();
    await sdk.signInWithPopup(auth, googleProvider);
  }

  async signOut(): Promise<void> {
    if (this.firebaseEnabled) {
      const { auth, sdk } = await this.loadRuntime();
      await sdk.signOut(auth);
    }
  }

  onSessionChanged(handler: (session: RuntimeSession | null) => void): () => void {
    if (!this.firebaseEnabled) {
      return () => {
        handler(null);
      };
    }

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    void this.loadRuntime().then(({ auth, sdk }) => {
      if (disposed) {
        return;
      }
      unsubscribe = sdk.onAuthStateChanged(auth, async (user) => {
        if (!user) {
          handler(null);
          return;
        }

        const tokenResult = await user.getIdTokenResult();
        handler({
          idToken: tokenResult.token,
          email: user.email || undefined,
          displayName: user.displayName || undefined,
        });
      });
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }
}

/** Singleton auth instance shared across the backoffice app. */
export const backofficeAuth = new BackofficeAuth();
