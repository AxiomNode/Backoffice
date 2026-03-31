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
  role: "SuperAdmin" | "Admin" | "Viewer" | "Gamer";
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

/** Wraps Firebase Auth (or dev-mode stub) for Google sign-in and session tracking. */
export class BackofficeAuth {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private googleProvider: GoogleAuthProvider | null = null;

  constructor() {
    if (AUTH_MODE === "firebase" && isFirebaseConfigured()) {
      this.app = initializeApp(firebaseConfig);
      this.auth = getAuth(this.app);
      this.googleProvider = new GoogleAuthProvider();
    }
  }

  get mode(): RuntimeAuthMode {
    if (this.auth) {
      return "firebase";
    }
    return "dev";
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.auth || !this.googleProvider) {
      throw new Error("Firebase auth no esta configurado en este entorno.");
    }
    await signInWithPopup(this.auth, this.googleProvider);
  }

  async signOut(): Promise<void> {
    if (this.auth) {
      await signOut(this.auth);
    }
  }

  onSessionChanged(handler: (session: RuntimeSession | null) => void): () => void {
    if (!this.auth) {
      return () => {
        handler(null);
      };
    }

    return onAuthStateChanged(this.auth, async (user) => {
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
  }
}

/** Singleton auth instance shared across the backoffice app. */
export const backofficeAuth = new BackofficeAuth();
