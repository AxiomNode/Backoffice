import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";

export type RuntimeAuthMode = "firebase" | "dev";

export type BackofficeSession = {
  isAuthenticated: boolean;
  displayName: string;
  email?: string;
  role: "SuperAdmin" | "Admin" | "Viewer" | "Gamer";
  firebaseUid: string;
  provider: RuntimeAuthMode;
};

export type RuntimeSession = {
  idToken?: string;
  email?: string;
  displayName?: string;
};

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE ?? "dev") as RuntimeAuthMode;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

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

export const backofficeAuth = new BackofficeAuth();
