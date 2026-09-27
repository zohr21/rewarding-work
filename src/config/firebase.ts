/**
 * Firebase project settings for optional accounts (src/lib/account).
 *
 * These values are not secrets — they identify the project to the browser and are
 * visible in every Firebase web app. Access is controlled by firestore.rules and the
 * sign-in providers enabled in the Firebase console.
 *
 * Locally: copy .env.example to .env. On GitHub: add them as repository variables
 * (Settings → Secrets and variables → Actions → Variables). Without them the site
 * builds and works as before, with no accounts.
 */
export const FIREBASE_CONFIG = {
  apiKey: String(import.meta.env.PUBLIC_FIREBASE_API_KEY ?? ''),
  authDomain: String(import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? ''),
  projectId: String(import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ?? ''),
  appId: String(import.meta.env.PUBLIC_FIREBASE_APP_ID ?? ''),
};

/** Local testing: `PUBLIC_FIREBASE_EMULATOR=true` talks to `firebase emulators:start` instead. */
export const USE_EMULATOR = String(import.meta.env.PUBLIC_FIREBASE_EMULATOR) === 'true';

export const ACCOUNTS_ENABLED = Object.values(FIREBASE_CONFIG).every((v) => v.length > 0);
