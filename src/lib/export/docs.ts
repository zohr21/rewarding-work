/**
 * Builds a Google Doc report from an export: a summary, focus per day, today's plan as
 * a checklist, each task with its steps and session log, what got done, and the tiers.
 *
 * Pure: returns the requests for the Docs API (documents.batchUpdate). The whole text is
 * inserted in one go, then styled by range — so every range is counted in the same
 * UTF-16 units the Docs API uses (a JavaScript string's length).
 */
import { addDays, dayKey, formatShort, startOfDay, startOfWeek } from '../dates';
import { allProgress, TIER_NAMES } from '../rewards';
import { chainStats, minutesByDay } from '../stats';
import { focusByTask, formatFocus, isCarriedOver, taskName, todayTasks } from '../tasks';
import type { ExportData } from './collect';

type Json = Record<string, unknown>;

export interface DocBuild {
  requests: Json[];
  /** Section headings with a short count, for the dialog's preview. */
  outline: { title: string; detail: string }[];
}

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const longFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const BAR_MAX = 24;

/** Collects paragraphs and the ranges to style once the text is in the document. */
class Writer {
  text = '';
  private styles: Json[] = [];
  private bullets: Json[] = [];

  /** Document indexes start at 1. */
  private get at(): number {
    return this.text.length + 1;
  }

  para(line: string, style?: 'TITLE' | 'SUBTITLE' | 'HEADING_1' | 'HEADING_2', text?: Json): void {
    const start = this.at;
    this.text += `${line}\n`;
    const range = { startIndex: start, endIndex: this.at };
    if (style) this.styles.push({ updateParagraphStyle: { range, paragraphStyle: { namedStyleType: style }, fields: 'namedStyleType' } });
    if (text && line) {
      this.styles.push({ updateTextStyle: { range: { startIndex: start, endIndex: this.at - 1 }, textStyle: text, fields: Object.keys(text).join(',') } });
    }
  }

  /** A run of bullets; `struck` marks the lines to cross out (done steps). */
  list(lines: string[], preset: 'BULLET_CHECKBOX' | 'BULLET_DISC_CIRCLE_SQUARE', struck: boolean[] = []): void {
    if (!lines.length) return;
    const start = this.at;
    lines.forEach((line, i) => {
      const from = this.at;
      this.text += `${line}\n`;
      if (struck[i]) {
        this.styles.push({ updateTextStyle: { range: { startIndex: from, endIndex: this.at - 1 }, textStyle: { strikethrough: true }, fields: 'strikethrough' } });
      }
    });
    this.bullets.push({ createParagraphBullets: { range: { startIndex: start, endIndex: this.at }, bulletPreset: preset } });
  }

  requests(): Json[] {
    return [{ insertText: { location: { index: 1 }, text: this.text } }, ...this.styles, ...this.bullets];
  }
}

export function buildDoc(data: ExportData): DocBuild {
  const { options, now } = data;
  const w = new Writer();
  const outline: DocBuild['outline'] = [];
  const focus = focusByTask(data.allSessions);
  const open = data.tasks.filter((t) => t.status === 'active');

  w.para('REWARDING WORK · REPORT', undefined, { bold: true, fontSize: { magnitude: 9, unit: 'PT' } });
  w.para(options.range === 'week' ? `Week of ${data.rangeLabel}` : `${data.rangeLabel}, to ${longFmt.format(now)}`, 'TITLE');
  w.para(`Exported ${longFmt.format(now)}. Everything below comes from your own data.`);
  w.para('');

  // Summary
  const focusSeconds = data.sessions.reduce((sum, s) => sum + s.focusSeconds, 0);
  const summary: string[] = [];
  if (options.sessions) summary.push(`Focus time: ${formatFocus(focusSeconds)}`, `Sessions: ${data.sessions.length}`);
  if (options.done) summary.push(`Things done: ${data.done.length}`);
  if (options.chain) {
    const s = chainStats(data.chain.days, now);
    summary.push(`Chain: ${plural(s.current, 'day')} (best ${s.best})`);
  }
  if (summary.length) {
    w.para('Summary', 'HEADING_1');
    w.list(summary, 'BULLET_DISC_CIRCLE_SQUARE');
    outline.push({ title: 'Summary', detail: plural(summary.length, 'number') });
  }

  // Focus per day (a week or 30 days) or per week (all time, last 12 weeks), as text bars.
  if (options.sessions && data.sessions.length) {
    const byDay = minutesByDay(data.sessions);
    let rows: { label: string; minutes: number }[];
    if (data.from) {
      const days = options.range === 'week' ? 7 : 30;
      rows = Array.from({ length: days }, (_, i) => {
        const d = addDays(data.from!, i);
        return { label: `${weekdayFmt.format(d)} ${formatShort(d)}`, minutes: Math.round(byDay.get(dayKey(d)) ?? 0) };
      }).filter((r, i) => addDays(data.from!, i) <= startOfDay(now) || r.minutes > 0);
    } else {
      const first = addDays(startOfWeek(now), -7 * 11);
      rows = Array.from({ length: 12 }, (_, i) => {
        const monday = addDays(first, i * 7);
        let minutes = 0;
        for (let d = 0; d < 7; d++) minutes += byDay.get(dayKey(addDays(monday, d))) ?? 0;
        return { label: `week of ${formatShort(monday)}`, minutes: Math.round(minutes) };
      });
    }
    const max = Math.max(1, ...rows.map((r) => r.minutes));
    w.para(data.from ? 'Focus per day' : 'Focus per week, last 12 weeks', 'HEADING_1');
    for (const r of rows) {
      const bar = r.minutes ? '█'.repeat(Math.max(1, Math.round((r.minutes / max) * BAR_MAX))) : '·';
      w.para(`${bar}  ${r.minutes} min · ${r.label}`);
    }
    outline.push({ title: data.from ? 'Focus per day' : 'Focus per week', detail: plural(rows.length, 'row') });
  }

  if (options.tasks) {
    const today = todayTasks(open);
    if (today.length) {
      w.para("Today's plan", 'HEADING_1');
      w.list(
        today.map((t, i) => {
          const n = t.steps.length;
          const bits = [n ? `${t.steps.filter((s) => s.done).length} of ${plural(n, 'step')}` : 'no steps yet'];
          if (i === 0) bits.push('first up');
          if (isCarriedOver(t, now.getTime())) bits.push(`carried over from ${weekdayFmt.format(t.todayAt)}`);
          return `${taskName(t)} · ${bits.join(' · ')}`;
        }),
        'BULLET_CHECKBOX',
      );
      outline.push({ title: "Today's plan", detail: plural(today.length, 'task') });
    }

    // Tasks that have something to show: steps, focus time, or (if included) notes and a log.
    const since = data.from?.getTime() ?? -Infinity;
    const detailed = open.filter((t) => t.steps.length || (focus.get(t.id) ?? 0) >= 60 || (options.notes && (t.notes || t.log?.length)));
    if (detailed.length) {
      w.para('Task by task', 'HEADING_1');
      for (const t of detailed) {
        const seconds = focus.get(t.id) ?? 0;
        w.para(seconds >= 60 ? `${taskName(t)} · ${formatFocus(seconds)} focused` : taskName(t), 'HEADING_2');
        w.list(
          t.steps.map((s) => s.text),
          'BULLET_CHECKBOX',
          t.steps.map((s) => s.done),
        );
        if (options.notes) {
          if (t.notes) w.para(`Notes: ${t.notes.replace(/\s*\n\s*/g, ' / ')}`);
          const log = (t.log ?? []).filter((e) => e.at >= since);
          if (log.length) {
            w.para('Session log', undefined, { bold: true });
            w.list(
              log.map((e) => {
                const said = [e.did && `did: ${e.did}`, e.next && `next: ${e.next}`].filter(Boolean).join(' · ');
                return `${formatShort(new Date(e.at))} · ${said} (${formatFocus(e.focusSeconds)})`;
              }),
              'BULLET_DISC_CIRCLE_SQUARE',
            );
          }
        }
      }
      outline.push({ title: 'Task by task', detail: plural(detailed.length, 'task') });
    }
  }

  if (options.done && data.done.length) {
    w.para(options.range === 'week' ? 'Done this week' : 'Done', 'HEADING_1');
    w.list(
      data.done.map((d) => d.text),
      'BULLET_DISC_CIRCLE_SQUARE',
    );
    outline.push({ title: 'Done', detail: plural(data.done.length, 'thing') });
  }

  // Tiers count everything you've ever done, whatever the range.
  if (options.sessions || options.done || options.chain) {
    const progress = allProgress({ sessions: data.allSessions, done: data.done, chainDays: data.chain.days, pastBests: data.chain.pastBests }).filter(
      (p) => (p.track.id === 'done' ? options.done && options.range === 'all' : p.track.id === 'streak' ? options.chain : options.sessions) && p.level > 0,
    );
    if (progress.length) {
      w.para('Reward tiers', 'HEADING_1');
      w.list(
        progress.map((p) => {
          const next = p.track.thresholds[p.level];
          return `${p.track.title}: ${TIER_NAMES[p.level - 1]}.${next === undefined ? ' All five tiers reached.' : ` ${TIER_NAMES[p.level]} is at ${p.track.describe(next)}.`}`;
        }),
        'BULLET_DISC_CIRCLE_SQUARE',
      );
      outline.push({ title: 'Reward tiers', detail: plural(progress.length, 'track') });
    }
  }

  w.para('');
  w.para('Created by Rewarding Work. This document lives in your Drive and is not updated automatically.', undefined, { italic: true });

  return { requests: w.requests(), outline };
}
