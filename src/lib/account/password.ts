/**
 * Password rules, following NIST SP 800-63B: a minimum length, a generous maximum,
 * any characters allowed, no forced "one symbol + one digit" rules, and a check
 * against passwords known from data breaches.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'abcdefgh', 'abc12345', '11111111', '00000000', 'letmein1', 'welcome1', 'sunshine', 'football',
  'baseball', 'princess', 'passw0rd', 'trustno1', 'rewarding', 'rewardingwork',
]);

/** A reason the password can't be used, or null if it's fine. */
export function passwordProblem(pw: string, email = ''): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (/^(.)\1+$/.test(pw)) return "Don't repeat a single character.";
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common.';
  const name = email.split('@')[0]?.toLowerCase() ?? '';
  if (name.length >= 3 && pw.toLowerCase().includes(name)) return "Don't include your email name in the password.";
  return null;
}

/** Rough strength for the meter: 0 (can't be used) … 3 (strong). Length matters most. */
export function passwordStrength(pw: string, email = ''): 0 | 1 | 2 | 3 {
  if (passwordProblem(pw, email)) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const score = pw.length + kinds * 2 + (/\s/.test(pw) ? 3 : 0); // passphrases get a small boost
  if (score >= 22) return 3;
  if (score >= 15) return 2;
  return 1;
}

/**
 * How many times the password appears in known data breaches (Have I Been Pwned).
 * Private by design: only the first 5 characters of the password's SHA-1 hash are
 * sent, and the match is made here in the browser. Returns null if the check
 * couldn't run (offline etc.) — then sign-up isn't blocked.
 */
export async function timesBreached(pw: string): Promise<number | null> {
  try {
    const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
    const hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const suffix = hash.slice(5);
    for (const line of (await res.text()).split('\n')) {
      const [s, count] = line.trim().split(':');
      if (s === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}
