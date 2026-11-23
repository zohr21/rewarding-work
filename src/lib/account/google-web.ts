/**
 * Google sign-in on the website, through Google Identity Services instead of Firebase's
 * own pop-up.
 *
 * Firebase's pop-up runs on the project's auth domain (…firebaseapp.com) and hands the
 * result back to this site across two sites. Browsers that block third-party cookies or
 * partition storage (Chrome's tracking protection, Safari, Brave) break that hand-back:
 * the window closes and Firebase reports "popup closed by user". Google's own window
 * talks to this page directly, so it keeps working there. The access token it returns is
 * turned into a Firebase credential and never stored.
 *
 * Needs the Firebase project's web OAuth client (PUBLIC_FIREBASE_GOOGLE_CLIENT_ID) with
 * this site's origin under "Authorized JavaScript origins". Without the client id the
 * account code falls back to Firebase's pop-up.
 */
import { GoogleAuthProvider, type AuthCredential } from 'firebase/auth';
import { loadGoogle, googleReady } from '../export/google';

const SCOPE = 'openid email profile';

const fail = (code: string, message: string) => Object.assign(new Error(message), { code });

/** Start fetching Google's script ahead of the click, so the window opens without delay. */
export function prepareGoogleWeb(): void {
  loadGoogle().catch(() => {});
}

/** Opens Google's sign-in window and returns a Firebase credential. Call from a click. */
export async function googleWebCredential(clientId: string): Promise<AuthCredential> {
  try {
    await loadGoogle();
  } catch {
    throw fail('auth/network-request-failed', "Couldn't reach Google.");
  }
  if (!googleReady()) throw fail('google/unavailable', 'Google sign-in did not load.');
  const token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) resolve(r.access_token);
        else reject(fail(r.error === 'access_denied' ? 'google/cancelled' : 'google/unavailable', r.error_description ?? r.error ?? 'Google sign-in failed.'));
      },
      error_callback: (e) =>
        reject(e.type === 'popup_failed_to_open' ? fail('auth/popup-blocked', 'Pop-up blocked.') : fail('google/cancelled', 'Google window closed.')),
    });
    client.requestAccessToken();
  });
  return GoogleAuthProvider.credential(null, token);
}
