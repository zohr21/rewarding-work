/**
 * Names of fixed choices, in the current language. They live here rather than next to their
 * lists because src/data/taxonomy.ts is also read by the content build, which has no page
 * or stored language.
 */
import type { TimerMode } from '../../data/taxonomy';
import type { Tone } from '../timer/cues';
import { t, type Key } from './index';

const MODE_KEYS: Record<TimerMode, Key> = {
  pomodoro: 'mode.pomodoro',
  '52-17': 'mode.fiftyTwo',
  flowtime: 'mode.flowtime',
  custom: 'mode.custom',
};

/** "Pomodoro", "52/17", "Flowtime", "Custom". */
export const modeKey = (mode: TimerMode): Key => MODE_KEYS[mode];
export const modeLabel = (mode: TimerMode): string => t(MODE_KEYS[mode]);

/** "Chime", "Bell"… */
export const toneLabel = (tone: Tone): string => t(`tone.${tone}`);
