/**
 * Bank alerts into Budget while the app is open, on any page (src/lib/bank.ts). Tells the
 * phone which sources to keep, takes the alerts it kept while the app was closed, and each
 * new one as it comes. An expense added this way offers Undo, so a wrong one is one tap away.
 * Loaded only in the app (AppNav.astro).
 */
import { subscribe } from '../lib/storage';
import { bankAck, bankPending, onBankNotice, setBankSources, type BankNotice } from '../lib/device';
import { dropPending, getBank, repairImportedNames, sourcesOf, takeAlerts } from '../lib/bank';
import { formatMoney, getBudget, removeSpends } from '../lib/budget';
import { t, tn } from '../lib/i18n';
import { offerUndo } from '../lib/undo';
import { cleanups, listen } from '../lib/page';

function take(notices: BankNotice[]): void {
  const taken = takeAlerts(notices);
  if (taken.ids.length) void bankAck(taken.ids);
  // Named by the newest, the one you just paid; Undo takes back all of them.
  const added = taken.added;
  const entry = added.at(-1);
  if (!entry) return;
  const sign = getBudget().currency;
  const more = added.length - 1;
  offerUndo({
    message: t('budget.v.added', { what: entry.what, amount: formatMoney(entry.amount, sign) }) + (more ? tn('budget.bs.andMore', more) : ''),
    commit: () => {},
    undo: () => {
      removeSpends(added.map((e) => e.id));
      for (const e of added) dropPending(e.id.replace(/^b-/, ''));
    },
  });
}

export function mountBankSync(): () => void {
  const c = cleanups();
  let sent = '';
  const sendSources = () => {
    const sources = sourcesOf(getBank());
    const json = JSON.stringify(sources);
    if (json === sent) return;
    sent = json;
    void setBankSources(sources);
  };
  const takeWaiting = async () => {
    if (getBank().on) take(await bankPending());
  };
  let on = getBank().on;
  repairImportedNames();
  sendSources();
  void takeWaiting();
  c.add(
    subscribe('bank', () => {
      sendSources();
      // Just turned on: alerts showing on the phone may already be waiting.
      if (!on && getBank().on) void takeWaiting();
      on = getBank().on;
    }),
  );
  c.add(onBankNotice((notice) => take([notice])));
  c.add(listen(document, 'visibilitychange', () => document.visibilityState === 'visible' && void takeWaiting()));
  return c.run;
}
