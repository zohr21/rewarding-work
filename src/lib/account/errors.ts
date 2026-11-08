/** Turn Firebase error codes into plain sentences. No Firebase import needed. */
import { t, type Key } from '../i18n';

/** Each error code's sentence in the word lists (err.*). */
const MESSAGES: Record<string, Key> = {
  'auth/invalid-email': 'err.badEmail',
  'auth/missing-email': 'err.noEmail',
  'auth/missing-password': 'err.noPassword',
  'auth/weak-password': 'err.weak',
  'auth/password-does-not-meet-requirements': 'err.requirements',
  'auth/email-already-in-use': 'err.emailInUse',
  'auth/credential-already-in-use': 'err.googleInUse',
  'auth/invalid-credential': 'err.wrongLogin',
  'auth/invalid-login-credentials': 'err.wrongLogin',
  'auth/wrong-password': 'err.wrongPassword',
  'auth/user-not-found': 'err.wrongLogin',
  'auth/user-disabled': 'err.disabled',
  'auth/too-many-requests': 'err.tooMany',
  'auth/network-request-failed': 'err.network',
  'auth/popup-blocked': 'err.popupBlocked',
  'auth/popup-closed-by-user': 'err.popupClosed',
  'auth/cancelled-popup-request': 'err.popupClosed',
  'google/cancelled': 'err.googleCancelled',
  'google/unavailable': 'err.googleUnavailable',
  'auth/requires-recent-login': 'err.recentLogin',
  'auth/provider-already-linked': 'err.googleLinked',
  'auth/operation-not-allowed': 'err.methodOff',
  'auth/admin-restricted-operation': 'err.methodOff',
  'auth/unauthorized-domain': 'err.domain',
  'permission-denied': 'err.rules',
  unavailable: 'err.offline',
};

export function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function friendlyError(err: unknown): string {
  const code = errorCode(err);
  if (MESSAGES[code]) return t(MESSAGES[code]);
  if (code.startsWith('auth/api-key-not-valid')) return t('err.apiKey');
  if (err instanceof Error && !code) return err.message;
  return t('err.unknown');
}
