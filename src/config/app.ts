/**
 * True in the build that ships inside the Android app (`npm run build:app`, see
 * scripts/build-app.mjs). The app shows the same pages from files packed into it,
 * so a few browser-only things are switched off there.
 */
export const NATIVE_APP = String(import.meta.env.PUBLIC_NATIVE_APP) === 'true';

/**
 * True in the Google Play version of the app (`npm run apk:play`, `npm run release`).
 * It leaves out the weekly board for now: public nicknames would need reporting and
 * blocking under Play's user-generated content policy.
 */
export const PLAY_STORE = String(import.meta.env.PUBLIC_PLAY_STORE) === 'true';
