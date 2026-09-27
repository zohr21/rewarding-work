/**
 * The /account page: sign in / sign up / guest, and account settings once signed in.
 * Account logic is in src/lib/account; this file only wires up the page.
 */
import { friendlyError } from '../lib/account/errors';
import { passwordProblem, passwordStrength, timesBreached } from '../lib/account/password';
import { getAccount, loadAccount, onAccountChange, type AccountState } from '../lib/account/state';
import { cleanups, onPage } from '../lib/page';

type Runtime = Awaited<ReturnType<typeof loadAccount>>;

const SYNC_TEXT: Record<AccountState['sync'], string> = {
  idle: 'Connecting to your account…',
  saving: 'Saving changes to your account…',
  synced: 'All changes are saved to your account.',
  offline: "You're offline. Changes are kept here and sent when you're back online.",
  error: '',
};

onPage('account-page', () => {
  const page = document.querySelector<HTMLElement>('[data-account-page]');
  if (!page || !getAccount().enabled) return;
  const c = cleanups();
  const $ = <E extends Element = HTMLElement>(s: string, root: ParentNode = page) => root.querySelector<E>(s)!;
  const $$ = <E extends Element = HTMLElement>(s: string, root: ParentNode = page) => [...root.querySelectorAll<E>(s)];

  const pageMsg = $('[data-page-msg]');
  const runtime = loadAccount();
  runtime.catch(() => say(pageMsg, "Couldn't load the account code. Check your connection and reload.", true));

  function say(el: HTMLElement, text: string, error = false): void {
    el.textContent = text;
    el.classList.toggle('is-error', error);
  }

  /**
   * Run an account action with the button disabled and errors shown in `msg`.
   * With `toPage`, success goes to the banner at the top instead — for actions that
   * switch the page to another view, which would hide `msg`.
   */
  async function act(
    trigger: HTMLButtonElement | HTMLFormElement,
    msg: HTMLElement,
    fn: (m: Runtime) => Promise<string | void>,
    toPage = false,
  ): Promise<void> {
    const buttons = trigger instanceof HTMLFormElement ? $$<HTMLButtonElement>('button', trigger) : [trigger];
    buttons.forEach((b) => (b.disabled = true));
    say(pageMsg, '');
    say(msg, 'One moment…');
    try {
      const done = (await fn(await runtime)) ?? '';
      say(toPage ? pageMsg : msg, done);
      if (toPage) say(msg, '');
    } catch (err) {
      say(msg, friendlyError(err), true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  /** Validation error thrown before contacting the server. */
  const invalid = (message: string, input?: HTMLInputElement) => {
    input?.setAttribute('aria-invalid', 'true');
    input?.focus();
    return new Error(message);
  };

  function readEmail(form: HTMLFormElement): string {
    const input = $<HTMLInputElement>('input[name="email"]', form);
    const email = input.value.trim();
    if (!email) throw invalid('Enter your email address.', input);
    if (!input.checkValidity()) throw invalid("That email address doesn't look right.", input);
    return email;
  }

  /** Check a new password against the rules and known breaches. */
  async function readNewPassword(form: HTMLFormElement, email = ''): Promise<string> {
    const input = $<HTMLInputElement>('input[data-new]', form);
    const pw = input.value;
    const problem = passwordProblem(pw, email);
    if (problem) throw invalid(problem, input);
    const breached = await timesBreached(pw);
    if (breached) {
      throw invalid(
        `This password has appeared in ${breached.toLocaleString()} data breach${breached === 1 ? '' : 'es'}, so attackers try it. Please choose another.`,
        input,
      );
    }
    return pw;
  }

  // ---------- Password fields: show/hide, strength meter ----------

  for (const field of $$('[data-password-field]')) {
    const input = $<HTMLInputElement>('input', field);
    const toggle = $<HTMLButtonElement>('[data-pw-toggle]', field);
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    toggle.setAttribute('aria-label', 'Show password');

    if (!input.hasAttribute('data-new')) continue;
    const meter = $('.pw__meter', field);
    const hint = $('[data-pw-hint]', field);
    const defaultHint = hint.textContent ?? '';
    const email = () => input.form?.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? getAccount().user?.email ?? '';
    input.addEventListener('input', () => {
      const pw = input.value;
      const problem = pw ? passwordProblem(pw, email()) : null;
      meter.dataset.strength = pw ? String(passwordStrength(pw, email())) : '0';
      hint.textContent = problem ?? (pw ? ['', 'Okay — longer is stronger.', 'Good password.', 'Strong password.'][passwordStrength(pw, email())] : defaultHint);
      hint.classList.toggle('is-problem', Boolean(problem) && pw.length >= 8);
    });
  }

  page.addEventListener('input', (e) => (e.target as HTMLElement).removeAttribute?.('aria-invalid'));

  // ---------- Sign-in panels (signed out, and "save your guest account") ----------

  for (const panel of $$('[data-auth-panel]')) {
    const msg = $('[data-msg]', panel);
    const forms = $$<HTMLFormElement>('form', panel);

    const show = (name: string) => {
      forms.forEach((f) => (f.hidden = f.dataset.form !== name));
      $$('.auth__tab', panel).forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.authTab === name)));
      say(msg, '');
    };
    $$('[data-auth-tab]', panel).forEach((t) => t.addEventListener('click', () => show(t.dataset.authTab!)));
    $('[data-show-reset]', panel).addEventListener('click', () => {
      const typed = $<HTMLInputElement>('[data-form="signin"] input[name="email"]', panel).value;
      show('reset');
      const reset = $<HTMLInputElement>('[data-form="reset"] input[name="email"]', panel);
      reset.value = typed;
      reset.focus();
    });

    const google = $<HTMLButtonElement>('[data-google]', panel);
    google.addEventListener('click', () =>
      act(google, msg, async (m) => {
        await m.continueWithGoogle();
        return 'Signed in with Google.';
      }, true),
    );

    for (const form of forms) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void act(form, msg, async (m) => {
          const email = readEmail(form);
          if (form.dataset.form === 'create') {
            const pw = await readNewPassword(form, email);
            await m.createWithEmail(email, pw);
            form.reset();
            return `Account saved. We've sent a confirmation link to ${email}.`;
          }
          if (form.dataset.form === 'signin') {
            const input = $<HTMLInputElement>('input[type="password"], input[name="password"]', form);
            if (!input.value) throw invalid('Enter your password.', input);
            await m.signInWithEmail(email, input.value);
            form.reset();
            return 'Signed in.';
          }
          await m.resetPassword(email);
          return `If there's an account for ${email}, a reset link is on its way. Check your inbox (and spam folder).`;
        }, form.dataset.form !== 'reset');
      });
    }
  }

  const guestBtn = $<HTMLButtonElement>('[data-guest]');
  guestBtn.addEventListener('click', () =>
    act(guestBtn, $('[data-guest-msg]'), async (m) => {
      await m.continueAsGuest();
      return "You're using a guest account. Your progress is now backed up.";
    }, true),
  );

  // ---------- Signed in ----------

  const profileMsg = $('[data-profile-msg]');
  const resend = $<HTMLButtonElement>('[data-resend]');
  resend.addEventListener('click', () =>
    act(resend, profileMsg, async (m) => {
      await m.resendVerification();
      return 'Sent. The link is valid for a few days.';
    }),
  );
  const verified = $<HTMLButtonElement>('[data-verified]');
  verified.addEventListener('click', () =>
    act(verified, profileMsg, async (m) => {
      await m.refreshUser();
      return getAccount().user?.emailVerified ? 'Thanks — your email is confirmed.' : "It isn't confirmed yet. Open the link in the email first.";
    }),
  );

  const securityMsg = $('[data-security-msg]');
  const changeForm = $<HTMLFormElement>('[data-form="change-password"]');
  changeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void act(changeForm, securityMsg, async (m) => {
      const current = $<HTMLInputElement>('input[name="current"]', changeForm);
      if (!current.value) throw invalid('Enter your current password.', current);
      const next = await readNewPassword(changeForm, getAccount().user?.email ?? '');
      if (next === current.value) throw invalid('The new password is the same as the current one.');
      await m.changePassword(current.value, next);
      changeForm.reset();
      return 'Password changed.';
    });
  });
  const linkGoogle = $<HTMLButtonElement>('[data-link-google]');
  linkGoogle.addEventListener('click', () =>
    act(linkGoogle, securityMsg, async (m) => {
      await m.linkGoogle();
      return 'Google connected.';
    }),
  );

  const deviceMsg = $('[data-device-msg]');
  const signOutWarn = $('[data-sign-out-warn]');
  const signOutBtn = $<HTMLButtonElement>('[data-sign-out]');
  const doSignOut = (btn: HTMLButtonElement, force: boolean) =>
    act(btn, deviceMsg, async (m) => {
      const ok = await m.signOut(force);
      signOutWarn.hidden = ok;
      return ok ? 'You are signed out. Your data is safe in your account.' : '';
    }, true);
  signOutBtn.addEventListener('click', () => doSignOut(signOutBtn, false));
  const forceBtn = $<HTMLButtonElement>('[data-sign-out-force]');
  forceBtn.addEventListener('click', () => doSignOut(forceBtn, true));
  $('[data-sign-out-cancel]').addEventListener('click', () => (signOutWarn.hidden = true));

  // Delete: the first press asks, the second press deletes (same pattern as "Delete all data").
  const deleteForm = $<HTMLFormElement>('[data-form="delete"]');
  const deleteBtn = $<HTMLButtonElement>('[data-delete]');
  const deleteMsg = $('[data-delete-msg]');
  let armed = false;
  let disarm = 0;
  deleteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = getAccount().user?.isAnonymous ? 'Delete guest account' : 'Delete account';
    if (!armed) {
      armed = true;
      deleteBtn.textContent = 'Yes, delete it permanently';
      say(deleteMsg, 'Press again to confirm. This cannot be undone.');
      disarm = window.setTimeout(() => {
        armed = false;
        deleteBtn.textContent = label;
        say(deleteMsg, '');
      }, 8000);
      return;
    }
    armed = false;
    window.clearTimeout(disarm);
    deleteBtn.textContent = label;
    void act(deleteForm, deleteMsg, async (m) => {
      const pw = $<HTMLInputElement>('input[name="confirm"]', deleteForm);
      const needsPassword = !$('[data-delete-password]').hidden;
      if (needsPassword && !pw.value) throw invalid('Enter your password to confirm.', pw);
      await m.deleteAccount(needsPassword ? pw.value : undefined);
      deleteForm.reset();
      return 'Your account and its data have been deleted.';
    }, true);
  });
  c.add(() => window.clearTimeout(disarm));

  // ---------- Render ----------

  let lastView = '';
  c.add(
    onAccountChange((s) => {
      const view = !s.ready ? 'loading' : s.user ? 'signed-in' : 'signed-out';
      $$('[data-view]').forEach((el) => (el.hidden = el.dataset.view !== view));
      if (view !== lastView && lastView) {
        // Clear messages that belonged to the view we just left (page-level messages stay).
        $$('[role="status"]:not([data-page-msg])').forEach((el) => say(el, ''));
        signOutWarn.hidden = true;
      }
      lastView = view;

      const u = s.user;
      if (!u) return;
      const guest = u.isAnonymous;
      const hasPassword = u.providers.includes('password');
      const hasGoogle = u.providers.includes('google.com');

      $('[data-avatar]').textContent = guest ? '?' : (u.name ?? u.email ?? '?').trim().charAt(0).toUpperCase();
      $('[data-name]').textContent = guest ? 'Guest account' : (u.name ?? u.email ?? 'Your account');
      const badges = guest ? ['Guest · this browser only'] : [...(hasPassword ? ['Email and password'] : []), ...(hasGoogle ? ['Google'] : [])];
      if (!guest && u.name && u.email) badges.unshift(u.email);
      $('[data-badges]').replaceChildren(
        ...badges.map((b) => Object.assign(document.createElement('span'), { className: 'badge', textContent: b })),
      );

      $('[data-verify]').hidden = guest || !hasPassword || u.emailVerified;
      $('[data-verify-email]').textContent = u.email ?? '';

      $$('[data-guest-only]').forEach((el) => (el.hidden = !guest));
      $$('[data-member-only]').forEach((el) => (el.hidden = guest));
      $('[data-has-password]').hidden = !hasPassword;
      $('[data-google-linked]').hidden = !hasGoogle;
      $('[data-google-unlinked]').hidden = hasGoogle;
      $('[data-delete-password]').hidden = !hasPassword;
      $('[data-delete-title]').textContent = guest ? 'Delete guest account' : 'Delete account';
      if (!armed) deleteBtn.textContent = guest ? 'Delete guest account' : 'Delete account';

      const sync = $('.sync');
      sync.dataset.sync = s.sync;
      let text = s.sync === 'error' ? `Sync problem: ${s.syncError ?? 'unknown error'}` : SYNC_TEXT[s.sync];
      if (s.sync === 'synced' && s.lastSynced) {
        text += ` Last checked ${new Date(s.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      }
      $('[data-sync-text]').textContent = text;
    }),
  );

  return c.run;
});
