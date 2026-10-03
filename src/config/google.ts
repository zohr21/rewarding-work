/**
 * Google OAuth client for "Send to Google" (src/lib/export): creating a Sheet or a Doc
 * in the visitor's own Drive.
 *
 * Like the Firebase settings, the client id is not a secret — it ships to every browser
 * and only works from the origins listed for it in the Google Cloud console.
 *
 * Locally: PUBLIC_GOOGLE_CLIENT_ID in .env. On GitHub: repository variable
 * GOOGLE_CLIENT_ID. Without it the export dialog offers the backup file only.
 */
export const GOOGLE_CLIENT_ID = String(import.meta.env.PUBLIC_GOOGLE_CLIENT_ID ?? '');

export const GOOGLE_EXPORT_ENABLED = GOOGLE_CLIENT_ID.length > 0;

/**
 * The narrowest Drive scope: the site can create files and open the ones it created,
 * and cannot see anything else in the visitor's Drive.
 */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
