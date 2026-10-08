/** The backup file: everything, as JSON that "Import from JSON" reads back. */
import { dayKey } from '../dates';
import { chainsOf, exportBackup, type Backup } from '../storage';

export const backupFileName = (now = new Date()) => `rewarding-work-${dayKey(now)}.json`;

/** Saves the backup to the device and returns it (for a summary of what was saved). */
export function downloadBackup(): Backup {
  const backup = exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupFileName();
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return backup;
}

export function backupSummary({ data: d }: Backup): string {
  const done = d.done.filter((x) => x.deletedAt === undefined).length;
  const tasks = d.tasks.items.filter((t) => t.deletedAt === undefined).length;
  const exam = d.exam.exam ? ', your exam plan' : '';
  const chainDays = chainsOf(d.chain).reduce((n, c) => n + c.days.length, 0);
  return `${d.sessions.length} sessions, ${done} done items, ${tasks} tasks${exam} and ${chainDays} chain days`;
}
