/**
 * The /account page: sign in / sign up / guest, and account settings once signed in.
 * Account logic is in src/lib/account; this file only wires up the page.
 */
import { friendlyError } from '../lib/account/errors';
import { PASSWORD_MIN, passwordProblem, passwordStrength, timesBreached } from '../lib/account/password';
import { getAccount, loadAccount, onAccountChange, type AccountState } from '../lib/account/state';
import { cleanups, onPage } from '../lib/page';
import { NATIVE_APP } from '../config/app';
import { locale, t, tn, type Key } from '../lib/i18n';

type Runtime = Awaited<ReturnType<typeof loadAccount>>;

const SYNC_TEXT: Record<AccountState['sync'], Key | ''> = {
  idle: 'you.sync.idle',
  saving: 'you.sync.saving',
  synced: 'you.sync.synced',
  offline: 'you.sync.offline',
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
  runtime.catch(() => say(pageMsg, t('you.msg.loadFailed'), true));

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
    say(msg, t('you.msg.moment'));
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
    if (!email) throw invalid(t('err.noEmail'), input);
    if (!input.checkValidity()) throw invalid(t('err.badEmail'), input);
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
        tn('you.pw.breached', breached, { n: breached.toLocaleString(locale()) }),
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
      toggle.textContent = show ? t('you.hide') : t('you.show');
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? t('you.hidePassword') : t('you.showPassword'));
    });
    toggle.setAttribute('aria-label', t('you.showPassword'));

    if (!input.hasAttribute('data-new')) continue;
    const meter = $('.pw__meter', field);
    const hint = $('[data-pw-hint]', field);
    const defaultHint = tn('you.pw.hint', PASSWORD_MIN);
    const email = () => input.form?.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? getAccount().user?.email ?? '';
    input.addEventListener('input', () => {
      const pw = input.value;
      const problem = pw ? passwordProblem(pw, email()) : null;
      meter.dataset.strength = pw ? String(passwordStrength(pw, email())) : '0';
      hint.textContent = problem ?? (pw ? ['', t('you.pw.okay'), t('you.pw.good'), t('you.pw.strong')][passwordStrength(pw, email())] : defaultHint);
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
        return t('you.msg.signedInGoogle');
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
            return t('you.msg.saved', { email });
          }
          if (form.dataset.form === 'signin') {
            const input = $<HTMLInputElement>('input[type="password"], input[name="password"]', form);
            if (!input.value) throw invalid(t('err.noPassword'), input);
            await m.signInWithEmail(email, input.value);
            form.reset();
            return t('you.msg.signedIn');
          }
          await m.resetPassword(email);
          return t('you.msg.reset', { email });
        }, form.dataset.form !== 'reset');
      });
    }
  }

  const guestBtn = $<HTMLButtonElement>('[data-guest]');
  guestBtn.addEventListener('click', () =>
    act(guestBtn, $('[data-guest-msg]'), async (m) => {
      await m.continueAsGuest();
      return t('you.msg.guest');
    }, true),
  );

  // ---------- Signed in ----------

  const profileMsg = $('[data-profile-msg]');
  const resend = $<HTMLButtonElement>('[data-resend]');
  resend.addEventListener('click', () =>
    act(resend, profileMsg, async (m) => {
      await m.resendVerification();
      return t('you.msg.sent');
    }),
  );
  const verified = $<HTMLButtonElement>('[data-verified]');
  verified.addEventListener('click', () =>
    act(verified, profileMsg, async (m) => {
      await m.refreshUser();
      return getAccount().user?.emailVerified ? t('you.msg.confirmed') : t('you.msg.notConfirmed');
    }),
  );

  // Edit the name shown on the profile.
  const nameForm = $<HTMLFormElement>('[data-form="name"]');
  const nameInput = $<HTMLInputElement>('input[name="name"]', nameForm);
  $('[data-edit-open]').addEventListener('click', () => {
    nameForm.hidden = !nameForm.hidden;
    if (nameForm.hidden) return;
    nameInput.value = getAccount().user?.name ?? '';
    nameInput.focus();
  });
  $('[data-edit-cancel]').addEventListener('click', () => (nameForm.hidden = true));
  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void act(nameForm, profileMsg, async (m) => {
      const name = nameInput.value.trim();
      if (!name) throw invalid(t('you.msg.enterName'), nameInput);
      await m.updateName(name);
      nameForm.hidden = true;
      return t('you.msg.nameSaved');
    });
  });

  const securityMsg = $('[data-security-msg]');
  const changeForm = $<HTMLFormElement>('[data-form="change-password"]');
  changeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void act(changeForm, securityMsg, async (m) => {
      const current = $<HTMLInputElement>('input[name="current"]', changeForm);
      if (!current.value) throw invalid(t('err.currentPassword'), current);
      const next = await readNewPassword(changeForm, getAccount().user?.email ?? '');
      if (next === current.value) throw invalid(t('you.msg.samePassword'));
      await m.changePassword(current.value, next);
      changeForm.reset();
      return t('you.msg.passwordChanged');
    });
  });
  const linkGoogle = $<HTMLButtonElement>('[data-link-google]');
  linkGoogle.addEventListener('click', () =>
    act(linkGoogle, $('[data-connect-msg]'), async (m) => {
      await m.linkGoogle();
      return t('you.msg.googleConnected');
    }),
  );

  const deviceMsg = $('[data-device-msg]');
  const signOutWarn = $('[data-sign-out-warn]');
  const signOutBtn = $<HTMLButtonElement>('[data-sign-out]');
  const doSignOut = (btn: HTMLButtonElement, force: boolean) =>
    act(btn, deviceMsg, async (m) => {
      const ok = await m.signOut(force);
      signOutWarn.hidden = ok;
      return ok ? t('you.msg.signedOut') : '';
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
    const label = getAccount().user?.isAnonymous ? t('you.deleteGuest') : t('you.deleteAccountBtn');
    if (!armed) {
      armed = true;
      deleteBtn.textContent = t('you.deleteForever');
      say(deleteMsg, t('you.pressAgain'));
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
      if (needsPassword && !pw.value) throw invalid(t('you.msg.passwordToConfirm'), pw);
      await m.deleteAccount(needsPassword ? pw.value : undefined);
      deleteForm.reset();
      return t('you.msg.deleted');
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
      $('[data-name]').textContent = guest ? t('you.guestAccount') : (u.name ?? u.email ?? t('you.yourAccount'));
      $('[data-email]').textContent = guest ? (NATIVE_APP ? t('you.savedPhone') : t('you.savedBrowser')) : u.name && u.email ? u.email : '';
      const badges = guest
        ? [t('you.guestBadge')]
        : [...(hasPassword ? [t('you.emailAndPassword')] : []), ...(hasGoogle ? ['Google'] : []), ...(u.emailVerified ? [t('you.emailConfirmed')] : [])];
      $('[data-badges]').replaceChildren(
        ...badges.map((b) => Object.assign(document.createElement('span'), { className: 'badge badge--plain', textContent: b })),
      );
      $('[data-email-sub]').textContent = u.email ? `${u.email} · ${u.emailVerified ? t('you.confirmed') : t('you.notConfirmedYet')}` : '';
      if (guest) nameForm.hidden = true;

      $('[data-verify]').hidden = guest || !hasPassword || u.emailVerified;
      $('[data-verify-email]').textContent = u.email ?? '';

      $$('[data-guest-only]').forEach((el) => (el.hidden = !guest));
      $$('[data-member-only]').forEach((el) => (el.hidden = guest));
      $('[data-has-password]').hidden = !hasPassword;
      $('[data-google-linked]').hidden = !hasGoogle;
      $('[data-google-unlinked]').hidden = hasGoogle;
      $('[data-delete-password]').hidden = !hasPassword;
      $('[data-delete-title]').textContent = guest ? t('you.deleteGuestDots') : t('you.deleteAccount');
      if (!armed) deleteBtn.textContent = guest ? t('you.deleteGuest') : t('you.deleteAccountBtn');

      const sync = $('.sync');
      sync.dataset.sync = s.sync;
      const key = SYNC_TEXT[s.sync];
      let text = s.sync === 'error' ? t('you.sync.error', { error: s.syncError ?? t('you.sync.unknown') }) : key ? t(key) : '';
      if (s.sync === 'synced' && s.lastSynced) {
        text += ` · ${new Date(s.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      $('[data-sync-text]').textContent = text;
    }),
  );

  return c.run;
});
