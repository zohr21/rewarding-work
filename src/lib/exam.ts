/**
 * Exam prep actions shared by the widgets on the exam page: the goal, its chapters,
 * the question bank and practice rounds.
 *
 * Time on a chapter comes from timer sessions started from its Focus button: their
 * `taskId` is the chapter's id (see timer-ui.ts, /timer?chapter=<id>).
 */
import {
  CHAPTERS_MAX,
  PAST_MAX,
  QUESTIONS_MAX,
  ROUNDS_MAX,
  getExam,
  getExamStore,
  newId,
  setExam,
  setExamStore,
  updateExam,
  type Exam,
  type ExamChapter,
  type ExamQuestion,
  type ExamResult,
  type FocusSession,
  type PastExam,
} from './storage';
import { addDays, fromDayKey, isDayKey, startOfDay, startOfWeek } from './dates';

const NAME_MAX = 120;
const TEXT_MAX = 1000;
const OPTION_MAX = 300;
export const EXAM_NOTES_MAX = 2000;
export const ROUND_SIZE = 20;

const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);

export function cleanHours(n: number): number | undefined {
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 10) / 10, 10000) : undefined;
}

// ---------- Goal and chapters ----------

export interface GoalDraft {
  title: string;
  date?: string;
  targetHours?: number;
}

export interface ChapterDraft {
  name: string;
  plannedHours?: number;
}

/** One chapter per line; hours may follow a comma: "Networking, 14". */
export function parseChapterLines(text: string): ChapterDraft[] {
  const out: ChapterDraft[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(.*?)[,;\t]\s*(\d+(?:[.,]\d+)?)\s*(?:h|hours?)?\s*$/i.exec(line);
    const name = cleanName(m ? m[1]! : line);
    if (!name) continue;
    const plannedHours = m ? cleanHours(Number(m[2]!.replace(',', '.'))) : undefined;
    out.push(plannedHours ? { name, plannedHours } : { name });
  }
  return out.slice(0, CHAPTERS_MAX);
}

const toChapter = (d: ChapterDraft): ExamChapter => ({
  id: newId('ch'),
  name: d.name,
  ...(d.plannedHours ? { plannedHours: d.plannedHours } : {}),
  done: false,
});

function cleanGoal(goal: GoalDraft): GoalDraft {
  return {
    title: cleanName(goal.title),
    date: isDayKey(goal.date) ? goal.date : undefined,
    targetHours: goal.targetHours === undefined ? undefined : cleanHours(goal.targetHours),
  };
}

export function createExam(goal: GoalDraft, chapters: ChapterDraft[]): void {
  setExam({ ...cleanGoal(goal), chapters: chapters.map(toChapter), questions: [], rounds: [], createdAt: Date.now() });
}

export function saveGoal(goal: GoalDraft): void {
  updateExam(() => cleanGoal(goal));
}

export function deleteExam(): void {
  setExam(null);
}

// ---------- Finishing ----------

export const RESULT_LABELS: Record<ExamResult, string> = { passed: 'Passed', failed: "Didn't pass", finished: 'Finished' };

/**
 * You took the exam: the plan becomes a record under Past exams and the page is free
 * for the next goal. `studiedSeconds` is the focus time on its chapters (examTime).
 */
export function finishExam(result: ExamResult, studiedSeconds: number): PastExam | null {
  const { exam, past } = getExamStore();
  if (!exam) return null;
  const record: PastExam = {
    id: newId('px'),
    title: exam.title,
    ...(exam.date ? { date: exam.date } : {}),
    result,
    finishedAt: Date.now(),
    studiedSeconds: Math.round(studiedSeconds),
    chaptersDone: exam.chapters.filter((c) => c.done).length,
    chaptersTotal: exam.chapters.length,
    ...(result === 'failed' ? { retry: { chapters: exam.chapters, questions: exam.questions } } : {}),
  };
  setExamStore({ exam: null, past: [...past, record].slice(-PAST_MAX) });
  return record;
}

/**
 * Start a new plan from an exam you didn't pass: same chapters and questions, with the
 * time, the finished marks and the practice results starting again. Needs the page to be free.
 */
export function retryExam(pastId: string): boolean {
  const { exam, past } = getExamStore();
  const record = past.find((p) => p.id === pastId);
  if (exam || !record?.retry) return false;
  const newIds = new Map(record.retry.chapters.map((c) => [c.id, newId('ch')] as const));
  const { retry, ...rest } = record;
  setExamStore({
    exam: {
      title: record.title,
      chapters: retry.chapters.map((c) => ({ ...c, id: newIds.get(c.id)!, done: false })),
      questions: retry.questions.map((q) => ({
        ...q,
        chapterId: q.chapterId ? newIds.get(q.chapterId) : undefined,
        seen: 0,
        correct: 0,
        again: undefined,
      })),
      rounds: [],
      createdAt: Date.now(),
    },
    past: past.map((p) => (p.id === pastId ? rest : p)),
  });
  return true;
}

export function removePastExam(id: string): void {
  setExamStore({ past: getExamStore().past.filter((p) => p.id !== id) });
}

export function addChapter(name: string, plannedHours?: number): ExamChapter | null {
  const clean = cleanName(name);
  const exam = getExam();
  if (!clean || !exam || exam.chapters.length >= CHAPTERS_MAX) return null;
  const chapter = toChapter({ name: clean, plannedHours: plannedHours === undefined ? undefined : cleanHours(plannedHours) });
  updateExam((e) => ({ chapters: [...e.chapters, chapter] }));
  return chapter;
}

export function updateChapter(id: string, patch: Partial<Omit<ExamChapter, 'id'>>): void {
  updateExam((e) => ({
    chapters: e.chapters.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch };
      next.name = cleanName(next.name) || c.name;
      if (next.notes !== undefined) next.notes = next.notes.slice(0, EXAM_NOTES_MAX) || undefined;
      return next;
    }),
  }));
}

/** Its questions stay in the bank, without a chapter. Its focus sessions stay in your history. */
export function removeChapter(id: string): void {
  updateExam((e) => ({
    chapters: e.chapters.filter((c) => c.id !== id),
    questions: e.questions.map((q) => (q.chapterId === id ? { ...q, chapterId: undefined } : q)),
  }));
}

/** Move a chapter one place up (-1) or down (1). */
export function moveChapter(id: string, by: -1 | 1): void {
  updateExam((e) => {
    const from = e.chapters.findIndex((c) => c.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= e.chapters.length) return {};
    const chapters = [...e.chapters];
    [chapters[from], chapters[to]] = [chapters[to]!, chapters[from]!];
    return { chapters };
  });
}

// ---------- Time ----------

export interface ExamTime {
  /** Focus seconds on all chapters. */
  total: number;
  byChapter: Map<string, number>;
  /** When each chapter was last focused on (epoch ms). */
  lastAt: Map<string, number>;
}

export function examTime(exam: Exam, sessions: FocusSession[]): ExamTime {
  const ids = new Set(exam.chapters.map((c) => c.id));
  const byChapter = new Map<string, number>();
  const lastAt = new Map<string, number>();
  let total = 0;
  for (const s of sessions) {
    if (!s.taskId || !ids.has(s.taskId)) continue;
    total += s.focusSeconds;
    byChapter.set(s.taskId, (byChapter.get(s.taskId) ?? 0) + s.focusSeconds);
    lastAt.set(s.taskId, Math.max(lastAt.get(s.taskId) ?? 0, s.end));
  }
  return { total, byChapter, lastAt };
}

/** "5 h 10 m", "45 m". */
export function formatHM(seconds: number): string {
  const min = Math.round(seconds / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}

/** Whole days until the exam: 0 on the day, negative once it has passed, null without a date. */
export function daysLeft(exam: Pick<Exam, 'date'>, now = new Date()): number | null {
  if (!exam.date) return null;
  return Math.round((fromDayKey(exam.date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** Seconds a day needed to reach the target by the exam; null when that can't be worked out. */
export function pacePerDay(exam: Exam, studied: number, now = new Date()): number | null {
  const days = daysLeft(exam, now);
  if (days === null || days < 0 || !exam.targetHours) return null;
  const left = exam.targetHours * 3600 - studied;
  return left > 0 ? left / Math.max(1, days) : 0;
}

/** Focus minutes on the exam's chapters for Monday to Sunday of this week. */
export function weekMinutes(exam: Exam, sessions: FocusSession[], now = new Date()): { values: number[]; today: number; total: number } {
  const ids = new Set(exam.chapters.map((c) => c.id));
  const monday = startOfWeek(now);
  const from = monday.getTime();
  const to = addDays(monday, 7).getTime();
  const values = new Array<number>(7).fill(0);
  let total = 0;
  for (const s of sessions) {
    if (!s.taskId || !ids.has(s.taskId) || s.start < from || s.start >= to) continue;
    const day = (new Date(s.start).getDay() + 6) % 7;
    values[day] = values[day]! + s.focusSeconds / 60;
    total += s.focusSeconds;
  }
  return { values: values.map(Math.round), today: (now.getDay() + 6) % 7, total };
}

/** The chapter to continue with: the open one focused on most recently, else the first open one. */
export function nextChapter(exam: Exam, time: ExamTime): ExamChapter | null {
  const open = exam.chapters.filter((c) => !c.done);
  const recent = open.filter((c) => time.lastAt.has(c.id)).sort((a, b) => time.lastAt.get(b.id)! - time.lastAt.get(a.id)!)[0];
  return recent ?? open[0] ?? null;
}

// ---------- Question files ----------

export interface ParsedQuestion {
  /** Row in the file (1 = the first question). */
  row: number;
  /** The file's own chapter label ('' when it has none). */
  chapter: string;
  text: string;
  options: string[];
  answer: number[];
  explanation: string;
}

export interface ParseProblem {
  row: number;
  text: string;
  reason: string;
}

export type ParsedFile =
  | { ok: true; questions: ParsedQuestion[]; problems: ParseProblem[]; chapters: string[] }
  | { ok: false; error: string };

/** RFC 4180-style CSV: quoted fields, doubled quotes, line breaks inside quotes. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const QUESTION_KEYS = ['question', 'text', 'prompt'];
const CHAPTER_KEYS = ['chapter', 'topic', 'part', 'section', 'domain'];
const ANSWER_KEYS = ['answer', 'answers', 'correct', 'correct_answer'];
const WHY_KEYS = ['explanation', 'why', 'rationale'];
const OPTION_KEY = /^(?:(?:option|choice)_?([a-h]|[1-8])|([a-h]))$/;

const normKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** One question as found in a file, before checking. */
interface RawQuestion {
  chapter: string;
  text: string;
  options: string[];
  answer: string;
  explanation: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function rawFromRecord(rec: Record<string, unknown>): RawQuestion {
  const byKey = new Map(Object.entries(rec).map(([k, v]) => [normKey(k), v] as const));
  const first = (keys: string[]) => keys.map((k) => str(byKey.get(k))).find(Boolean) ?? '';
  let options: string[];
  const listed = byKey.get('options') ?? byKey.get('choices');
  if (Array.isArray(listed)) options = listed.map(str);
  else {
    options = [...byKey.entries()]
      .filter(([k]) => OPTION_KEY.test(k))
      .sort(([a], [b]) => (a.at(-1)! < b.at(-1)! ? -1 : 1))
      .map(([, v]) => str(v));
  }
  while (options.length && !options.at(-1)) options.pop();
  const ans = ANSWER_KEYS.map((k) => byKey.get(k)).find((v) => v !== undefined && v !== '');
  return {
    chapter: first(CHAPTER_KEYS),
    text: first(QUESTION_KEYS),
    options,
    answer: Array.isArray(ans) ? ans.map(str).join(',') : str(ans),
    explanation: first(WHY_KEYS),
  };
}

/** "A", "a,c", "2" (1-based) or the option's own text → indexes into `options`. */
function parseAnswer(answer: string, options: string[]): number[] | null {
  const whole = options.findIndex((o) => o.toLowerCase() === answer.toLowerCase());
  if (whole >= 0) return [whole];
  const picked = new Set<number>();
  for (const token of answer.split(/[\s,;|/&]+/).filter(Boolean)) {
    const i = /^[a-h]$/i.test(token) ? token.toLowerCase().charCodeAt(0) - 97 : /^\d+$/.test(token) ? Number(token) - 1 : -1;
    if (i < 0 || i >= options.length) return null;
    picked.add(i);
  }
  return picked.size ? [...picked].sort((a, b) => a - b) : null;
}

const questionKey = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Read a .csv or .json question file. Rows that can't be used are listed as problems
 * (with the reason) rather than rejecting the whole file. `existing` is the current
 * bank, so questions already in it are skipped.
 */
export function parseQuestionFile(text: string, existing: ExamQuestion[]): ParsedFile {
  const body = text.replace(/^﻿/, '').trim();
  if (!body) return { ok: false, error: 'This file is empty.' };

  let raws: RawQuestion[];
  if (body.startsWith('[') || body.startsWith('{')) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return { ok: false, error: "This file isn't valid JSON." };
    }
    const list = Array.isArray(json) ? json : typeof json === 'object' && json !== null ? (json as { questions?: unknown }).questions : null;
    if (!Array.isArray(list)) return { ok: false, error: 'Expected a list of questions.' };
    raws = list.map((item) => rawFromRecord(typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}));
  } else {
    const headerLine = body.split(/\r?\n/, 1)[0]!;
    const delimiter = [',', ';', '\t'].sort((a, b) => headerLine.split(b).length - headerLine.split(a).length)[0]!;
    const [header, ...rows] = parseCsv(body, delimiter);
    const keys = (header ?? []).map(normKey);
    if (!keys.some((k) => QUESTION_KEYS.includes(k))) {
      return { ok: false, error: 'No "question" column found. The first row must name the columns.' };
    }
    raws = rows.map((r) => rawFromRecord(Object.fromEntries(keys.map((k, i) => [k, r[i] ?? '']))));
  }
  if (!raws.length) return { ok: false, error: 'No questions found in this file.' };

  const seen = new Map<string, number>();
  const inBank = new Set(existing.map((q) => questionKey(q.text)));
  const room = Math.max(0, QUESTIONS_MAX - existing.length);
  const questions: ParsedQuestion[] = [];
  const problems: ParseProblem[] = [];
  raws.forEach((raw, i) => {
    const row = i + 1;
    const fail = (reason: string) => problems.push({ row, text: raw.text.slice(0, 120), reason });
    if (!raw.text) return fail('No question text');
    const key = questionKey(raw.text);
    if (inBank.has(key)) return fail('Already in your question bank');
    if (seen.has(key)) return fail(`Same as row ${seen.get(key)}`);
    if (raw.options.length < 2) return fail('Fewer than two options');
    if (raw.options.some((o) => !o)) return fail('An option is empty');
    if (!raw.answer) return fail('No answer marked');
    const answer = parseAnswer(raw.answer, raw.options);
    if (!answer) return fail("The answer doesn't match an option");
    if (questions.length >= room) return fail(`Over the limit of ${QUESTIONS_MAX} questions`);
    seen.set(key, row);
    questions.push({
      row,
      chapter: cleanName(raw.chapter),
      text: raw.text.slice(0, TEXT_MAX),
      options: raw.options.map((o) => o.slice(0, OPTION_MAX)),
      answer,
      explanation: raw.explanation.slice(0, TEXT_MAX),
    });
  });
  return { ok: true, questions, problems, chapters: [...new Set(questions.map((q) => q.chapter).filter(Boolean))] };
}

/** A chapter id, or: make a new chapter with the file's label, or leave the questions without one. */
export type ChapterChoice = string;
export const CHOICE_NEW = 'new';
export const CHOICE_NONE = 'none';

/** Best guess for a file's chapter label: the chapter with that name, or one containing it (or the other way round). */
export function guessChapter(label: string, chapters: ExamChapter[]): ChapterChoice {
  const key = label.toLowerCase();
  const exact = chapters.find((c) => c.name.toLowerCase() === key);
  if (exact) return exact.id;
  const near = key.length >= 3 ? chapters.filter((c) => c.name.toLowerCase().includes(key) || key.includes(c.name.toLowerCase())) : [];
  return near.length === 1 ? near[0]!.id : CHOICE_NEW;
}

/** Add parsed questions to the bank. `choices` maps each file chapter label to where its questions go. */
export function importQuestions(parsed: ParsedQuestion[], choices: Map<string, ChapterChoice>): number {
  const exam = getExam();
  if (!exam) return 0;
  const chapters = [...exam.chapters];
  const idFor = new Map<string, string | undefined>();
  for (const [label, choice] of choices) {
    if (choice === CHOICE_NONE) idFor.set(label, undefined);
    else if (choice === CHOICE_NEW) {
      const made = chapters.length < CHAPTERS_MAX ? toChapter({ name: label }) : null;
      if (made) chapters.push(made);
      idFor.set(label, made?.id);
    } else idFor.set(label, chapters.some((c) => c.id === choice) ? choice : undefined);
  }
  const added: ExamQuestion[] = parsed.slice(0, Math.max(0, QUESTIONS_MAX - exam.questions.length)).map((p) => {
    const chapterId = idFor.get(p.chapter);
    return {
      id: newId('q'),
      ...(chapterId ? { chapterId } : {}),
      text: p.text,
      options: p.options,
      answer: p.answer,
      ...(p.explanation ? { explanation: p.explanation } : {}),
      seen: 0,
      correct: 0,
    };
  });
  setExam({ ...exam, chapters, questions: [...exam.questions, ...added] });
  return added.length;
}

export function clearQuestions(): void {
  updateExam(() => ({ questions: [], rounds: [] }));
}

export const TEMPLATE_CSV =
  'chapter,question,option_a,option_b,option_c,option_d,answer,explanation\r\n' +
  'Chapter name,"Your question, in quotes if it has commas",First option,Second option,Third option,Fourth option,B,Why B is right (optional)\r\n' +
  'Chapter name,A question with two right answers,First option,Second option,Third option,,"A,C",\r\n';

// ---------- Practice ----------

/** `chapterId` 'all' for the whole bank. Flagged, unseen and often-missed questions come first; the round is then shuffled. */
export function pickRound(exam: Exam, chapterId: string, size = ROUND_SIZE): ExamQuestion[] {
  const pool = exam.questions.filter((q) => chapterId === 'all' || q.chapterId === chapterId);
  const rank = (q: ExamQuestion) => (q.again ? 0 : q.seen === 0 ? 1 : 2 + q.correct / q.seen);
  const keyed = pool.map((q) => ({ q, rank: rank(q), tie: Math.random() }));
  keyed.sort((a, b) => a.rank - b.rank || a.tie - b.tie);
  return keyed
    .slice(0, size)
    .sort((a, b) => a.tie - b.tie)
    .map((k) => k.q);
}

export function isRight(question: ExamQuestion, picked: number[]): boolean {
  return picked.length === question.answer.length && question.answer.every((a) => picked.includes(a));
}

/** Count an answer. Answering clears "ask me again" (flag it again to keep it coming). */
export function recordAnswer(id: string, right: boolean): void {
  updateExam((e) => ({
    questions: e.questions.map((q) =>
      q.id === id ? { ...q, seen: q.seen + 1, correct: q.correct + (right ? 1 : 0), again: undefined } : q,
    ),
  }));
}

export function setAgain(id: string, again: boolean): void {
  updateExam((e) => ({ questions: e.questions.map((q) => (q.id === id ? { ...q, again: again || undefined } : q)) }));
}

export function recordRound(total: number, correct: number): void {
  if (total <= 0) return;
  updateExam((e) => ({ rounds: [...e.rounds, { at: Date.now(), total, correct }].slice(-ROUNDS_MAX) }));
}

export interface ChapterScore {
  chapter: ExamChapter;
  seen: number;
  correct: number;
}

/** The chapter with the lowest share of right answers, among those answered at least `min` times. */
export function weakestChapter(exam: Exam, min = 5): ChapterScore | null {
  const scores = exam.chapters.map((chapter) => {
    const qs = exam.questions.filter((q) => q.chapterId === chapter.id);
    return { chapter, seen: qs.reduce((n, q) => n + q.seen, 0), correct: qs.reduce((n, q) => n + q.correct, 0) };
  });
  const rated = scores.filter((s) => s.seen >= min && s.correct < s.seen);
  return rated.sort((a, b) => a.correct / a.seen - b.correct / b.seen)[0] ?? null;
}
