/**
 * Builds a Google Sheet from an export: one tab per kind of data, plus a Dashboard tab
 * whose numbers are formulas over the other tabs and whose charts read those tabs —
 * so the sheet keeps working when rows are added by hand.
 *
 * Pure: returns the request bodies for the Sheets API (spreadsheets.create, then one
 * spreadsheets.batchUpdate for charts and formatting). src/lib/export/google.ts sends them.
 */
import { TIMER_MODE_LABELS, type TimerMode } from '../../data/taxonomy';
import { fromDayKey } from '../dates';
import { focusByTask, LIST_LABELS, listOf, taskName } from '../tasks';
import { exportDays, type ExportData } from './collect';

type Json = Record<string, unknown>;

export interface SheetBuild {
  create: Json;
  /** Requests for spreadsheets.batchUpdate, applied after the sheet exists. */
  requests: Json[];
  /** Tab names with their row counts, for the dialog's preview. */
  tabs: { title: string; rows: number }[];
}

const IDS = { Dashboard: 1, Tasks: 2, Steps: 3, Sessions: 4, Log: 5, Done: 6, Chain: 7 } as const;
type TabName = keyof typeof IDS;

// ---------- Cells ----------

const str = (v: string): Json => ({ userEnteredValue: { stringValue: v } });
const num = (v: number): Json => ({ userEnteredValue: { numberValue: v } });
const bool = (v: boolean): Json => ({ userEnteredValue: { boolValue: v } });
const formula = (f: string, format?: Json): Json => ({ userEnteredValue: { formulaValue: f }, ...(format ? { userEnteredFormat: format } : {}) });
const head = (v: string): Json => ({ userEnteredValue: { stringValue: v }, userEnteredFormat: { textFormat: { bold: true } } });
const blank: Json = {};

const DATE_FORMAT = { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } };
const PERCENT_FORMAT = { numberFormat: { type: 'PERCENT', pattern: '0%' } };

/** A calendar day as a Sheets serial number (days since 30 Dec 1899), shown as a date. */
function day(date: Date | number): Json {
  const d = new Date(date);
  const serial = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5;
  return { userEnteredValue: { numberValue: serial }, userEnteredFormat: DATE_FORMAT };
}

const clock = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const row = (...values: Json[]): Json => ({ values });

function tab(name: TabName, rows: Json[], frozen = 1): Json {
  return {
    properties: { sheetId: IDS[name], title: name, gridProperties: { frozenRowCount: frozen } },
    data: [{ startRow: 0, startColumn: 0, rowData: rows }],
  };
}

/** A block of cells on a tab; end indexes are exclusive. */
const range = (name: TabName, r0: number, r1: number, c0: number, c1: number): Json => ({
  sheetId: IDS[name],
  startRowIndex: r0,
  endRowIndex: r1,
  startColumnIndex: c0,
  endColumnIndex: c1,
});

function chart(title: string, type: 'AREA' | 'COLUMN', domain: Json, series: Json, anchorRow: number): Json {
  return {
    addChart: {
      chart: {
        spec: {
          title,
          basicChart: {
            chartType: type,
            legendPosition: 'NO_LEGEND',
            headerCount: 1,
            domains: [{ domain: { sourceRange: { sources: [domain] } } }],
            series: [{ series: { sourceRange: { sources: [series] } }, targetAxis: 'LEFT_AXIS' }],
          },
        },
        position: {
          overlayPosition: { anchorCell: { sheetId: IDS.Dashboard, rowIndex: anchorRow, columnIndex: 3 }, widthPixels: 620, heightPixels: 300 },
        },
      },
    },
  };
}

// ---------- The sheet ----------

export function buildSheet(data: ExportData, title: string): SheetBuild {
  const { options } = data;
  const sheets: Json[] = [];
  const requests: Json[] = [];
  const tabs: SheetBuild['tabs'] = [];
  const add = (name: TabName, rows: Json[], frozen = 1) => {
    sheets.push(tab(name, rows, frozen));
    if (name !== 'Dashboard') tabs.push({ title: name, rows: rows.length - 1 });
    return rows.length;
  };

  const focus = focusByTask(data.allSessions);
  const titles = new Map(data.tasks.map((t) => [t.id, taskName(t)]));

  // Tasks: one row per task. Progress is a formula, so it follows edits to the two step columns.
  let taskRows = 0;
  if (options.tasks) {
    const rows = [row(...['Task', 'List', 'Status', 'Steps done', 'Steps', 'Progress', 'Focus min', 'Added', 'Finished'].map(head), ...(options.notes ? [head('Notes')] : []))];
    data.tasks.forEach((t, i) => {
      const r = i + 2;
      rows.push(
        row(
          str(taskName(t)),
          str(LIST_LABELS[listOf(t)]),
          str(t.status === 'done' ? 'Done' : 'Active'),
          num(t.steps.filter((s) => s.done).length),
          num(t.steps.length),
          formula(`=IF(E${r}=0,"",D${r}/E${r})`, PERCENT_FORMAT),
          num(Math.round((focus.get(t.id) ?? 0) / 60)),
          day(t.createdAt),
          t.doneAt ? day(t.doneAt) : blank,
          ...(options.notes ? [str(t.notes ?? '')] : []),
        ),
      );
    });
    taskRows = add('Tasks', rows);

    const steps = [row(...['Task', 'Step', 'Done'].map(head))];
    for (const t of data.tasks) for (const s of t.steps) steps.push(row(str(taskName(t)), str(s.text), bool(s.done)));
    add('Steps', steps);
  }

  let sessionRows = 0;
  if (options.sessions) {
    const rows = [row(...['Date', 'Start', 'Minutes', 'Mode', 'Task', 'Completed'].map(head))];
    for (const s of data.sessions) {
      rows.push(
        row(
          day(s.start),
          str(clock(s.start)),
          num(Math.round(s.focusSeconds / 6) / 10),
          str(TIMER_MODE_LABELS[s.mode as TimerMode] ?? s.mode),
          str((s.taskId && titles.get(s.taskId)) || s.label),
          bool(s.completed),
        ),
      );
    }
    sessionRows = add('Sessions', rows);
  }

  if (options.tasks && options.notes) {
    const since = data.from?.getTime() ?? -Infinity;
    const rows = [row(...['Date', 'Task', 'What I did', 'Next', 'Focus min'].map(head))];
    const entries = data.tasks.flatMap((t) => (t.log ?? []).filter((e) => e.at >= since).map((e) => ({ t, e })));
    for (const { t, e } of entries.sort((a, b) => a.e.at - b.e.at)) {
      rows.push(row(day(e.at), str(taskName(t)), str(e.did), str(e.next), num(Math.round(e.focusSeconds / 60))));
    }
    add('Log', rows);
  }

  if (options.done) {
    const rows = [row(...['Date', 'What'].map(head))];
    for (const d of data.done) rows.push(row(day(d.doneAt), str(d.text)));
    add('Done', rows);
  }

  if (options.chain) {
    const rows = [row(...['Day marked', 'Habit'].map(head))];
    for (const key of data.chainDays) rows.push(row(day(fromDayKey(key)), str(data.chain.habit)));
    add('Chain', rows);
  }

  // Dashboard: totals as formulas, then a per-day table that the area chart reads.
  const dash: Json[] = [
    row({ userEnteredValue: { stringValue: `Focus dashboard · ${data.rangeLabel}` }, userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }),
    row(str('Worked out from the other tabs. Edit those, not this one.')),
    row(),
  ];
  const kpi = (label: string, f: string) => dash.push(row(head(label), formula(f)));
  if (options.sessions) {
    kpi('Focus minutes', '=ROUND(SUM(Sessions!C2:C))');
    kpi('Sessions', '=COUNTA(Sessions!A2:A)');
    kpi('Completed sessions', '=COUNTIF(Sessions!F2:F,TRUE)');
  }
  if (options.tasks) {
    kpi('Open tasks', '=COUNTIF(Tasks!C2:C,"Active")');
    kpi('Steps done', '=SUM(Tasks!D2:D)');
  }
  if (options.done) kpi('Things done', '=COUNTA(Done!A2:A)');
  if (options.chain) kpi('Chain days marked', '=COUNTA(Chain!A2:A)');

  if (options.sessions) {
    dash.push(row());
    const headRow = dash.length; // 0-based index of the table's header row
    dash.push(row(head('Day'), head('Focus min')));
    const days = exportDays(data);
    days.forEach((d, i) => dash.push(row(day(d), formula(`=ROUND(SUMIF(Sessions!A:A,A${headRow + 2 + i},Sessions!C:C))`))));
    const end = headRow + 1 + days.length;

    requests.push(chart('Focus minutes per day', 'AREA', range('Dashboard', headRow, end, 0, 1), range('Dashboard', headRow, end, 1, 2), 2));
    // The same numbers as a heat strip: deeper green for more minutes.
    requests.push({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [range('Dashboard', headRow + 1, end, 1, 2)],
          gradientRule: {
            minpoint: { type: 'NUMBER', value: '0', color: { red: 1, green: 1, blue: 1 } },
            maxpoint: { type: 'MAX', color: { red: 0.25, green: 0.56, blue: 0.38 } },
          },
        },
      },
    });
  }
  if (options.tasks && taskRows > 1) {
    requests.push(chart('Focus minutes by task', 'COLUMN', range('Tasks', 0, taskRows, 0, 1), range('Tasks', 0, taskRows, 6, 7), options.sessions ? 19 : 2));
  }
  sheets.unshift(tab('Dashboard', dash, 0));

  // Size every column to what's in it.
  for (const s of sheets) {
    const sheetId = (s.properties as { sheetId: number }).sheetId;
    requests.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 10 } } });
  }

  return {
    create: { properties: { title, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, sheets },
    requests,
    tabs: [{ title: 'Dashboard', rows: sessionRows ? exportDays(data).length : 0 }, ...tabs],
  };
}
