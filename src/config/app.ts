/**
 * True in the build that ships inside the Android app (`npm run build:app`, see
 * scripts/build-app.mjs). The app shows the same pages from files packed into it,
 * so a few browser-only things are switched off there.
 */
export const NATIVE_APP = String(import.meta.env.PUBLIC_NATIVE_APP) === 'true';
