/**
 * Sends a built Sheet or Doc to the visitor's Google Drive.
 *
 * Sign-in is Google's own pop-up (Google Identity Services), asking for one permission:
 * create files, and open the files this site created. The access token is used for the
 * few requests below and then dropped — it is never stored.
 *
 * Google's script is fetched only when the export dialog offers a Google destination.
 */
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPE } from '../../config/google';
import type { DocBuild } from './docs';
import type { SheetBuild } from './sheets';

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(): void;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string }) => void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(config: TokenClientConfig): TokenClient } } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

/** Load Google's sign-in script. Call this before the click that exports, so the pop-up isn't blocked. */
export function loadGoogle(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Couldn't reach Google. Check your connection and try again."));
    };
    document.head.append(script);
  });
  return loading;
}

export const googleReady = () => !!window.google?.accounts?.oauth2;

/** Opens Google's permission pop-up. Must run inside a click handler, after loadGoogle() has resolved. */
export function requestToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!googleReady()) {
      reject(new Error('Google sign-in is still loading. Try again in a moment.'));
      return;
    }
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: (r) => {
        if (r.access_token) resolve(r.access_token);
        else reject(new Error(r.error === 'access_denied' ? 'Permission was not given, so nothing was created.' : (r.error_description ?? 'Google sign-in failed.')));
      },
      error_callback: (e) =>
        reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed, so nothing was created.' : 'The Google window could not open. Allow pop-ups for this site and try again.')),
    });
    client.requestAccessToken();
  });
}

async function post<T>(url: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Google answered with an error (${response.status}).`;
    try {
      const detail = (await response.json()) as { error?: { message?: string } };
      if (detail.error?.message) message = detail.error.message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

/** Creates the spreadsheet, then adds its charts and formatting. Returns its address. */
export async function createSheet(token: string, sheet: SheetBuild): Promise<string> {
  const made = await post<{ spreadsheetId: string; spreadsheetUrl?: string }>('https://sheets.googleapis.com/v4/spreadsheets', token, sheet.create);
  if (sheet.requests.length) {
    await post(`https://sheets.googleapis.com/v4/spreadsheets/${made.spreadsheetId}:batchUpdate`, token, { requests: sheet.requests });
  }
  return made.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${made.spreadsheetId}/edit`;
}

/** Creates the document, then writes and styles its text. Returns its address. */
export async function createDoc(token: string, title: string, doc: DocBuild): Promise<string> {
  const made = await post<{ documentId: string }>('https://docs.googleapis.com/v1/documents', token, { title });
  await post(`https://docs.googleapis.com/v1/documents/${made.documentId}:batchUpdate`, token, { requests: doc.requests });
  return `https://docs.google.com/document/d/${made.documentId}/edit`;
}
