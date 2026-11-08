/** Lengths of time in words, in the current language. */
import { t, tn } from './index';

/** "25 min", "1 h", "6 h 33 min". */
export function hoursMinutes(totalMin: number): string {
  const min = Math.round(totalMin);
  if (min < 60) return t('unit.min', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t('unit.hMin', { h, m }) : t('unit.h', { n: h });
}

/** "5 minutes", whole minutes, in full words. */
export function minutesWords(ms: number): string {
  return tn('unit.minutes', Math.round(ms / 60_000));
}

/** "1 minute 30 seconds", for the screen reader. */
export function spokenDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return tn('unit.seconds', s);
  return s === 0 ? tn('unit.minutes', m) : `${tn('unit.minutes', m)} ${tn('unit.seconds', s)}`;
}

/** "3 min", or "less than a minute". */
export function shortMinutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? t('unit.lessThanMinute') : t('unit.min', { n: m });
}
