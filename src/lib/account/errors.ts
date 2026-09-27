/** Turn Firebase error codes into plain sentences. No Firebase import needed. */

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a longer password (at least 8 characters).',
  'auth/password-does-not-meet-requirements': "That password doesn't meet the requirements.",
  'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.',
  'auth/credential-already-in-use': 'That Google account already has an account here. Sign in with it instead.',
  'auth/invalid-credential': "The email or password isn't right.",
  'auth/invalid-login-credentials': "The email or password isn't right.",
  'auth/wrong-password': "The password isn't right.",
  'auth/user-not-found': "The email or password isn't right.",
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "Couldn't reach the server. Check your connection and try again.",
  'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before finishing.',
  'auth/requires-recent-login': 'For your security, confirm your identity again first.',
  'auth/provider-already-linked': 'Google is already connected to this account.',
  'auth/operation-not-allowed': "This sign-in method isn't turned on for this site yet.",
  'auth/admin-restricted-operation': "This sign-in method isn't turned on for this site yet.",
  'auth/unauthorized-domain': "Sign-in isn't allowed from this web address yet (add it in the Firebase console).",
  'permission-denied': "Your account didn't accept the data (check the Firestore rules).",
  unavailable: "Couldn't reach the server. Your changes are kept and will be sent later.",
};

export function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function friendlyError(err: unknown): string {
  const code = errorCode(err);
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith('auth/api-key-not-valid')) return 'Accounts are misconfigured on this site (invalid Firebase API key).';
  if (err instanceof Error && !code) return err.message;
  return 'Something went wrong. Please try again.';
}
