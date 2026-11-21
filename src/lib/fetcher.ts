'use client';

export type ApiError = { error: string; configured?: boolean };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* lege response */ }
  const data = (json ?? {}) as Record<string, unknown>;
  if (!res.ok || typeof data.error === 'string') {
    const err = new Error(typeof data.error === 'string' ? data.error : `Verzoek mislukt (${res.status})`) as Error & { status?: number; configured?: boolean };
    err.status = res.status;
    if (typeof data.configured === 'boolean') err.configured = data.configured;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(url: string, body?: unknown) => request<T>(url, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
  upload: <T>(url: string, form: FormData) => request<T>(url, { method: 'POST', body: form })
};

export type User = {
  id: string;
  email: string;
  name: string;
  xp: number;
  level: number;
  levelInto: number;
  levelNeed: number;
  streak: number;
  dailyGoalMinutes: number;
  settings: Record<string, unknown>;
  badges: string[];
  aiStatus: { configured: boolean; provider: string };
};

export type Subject = {
  id: string;
  name: string;
  color: string;
  icon: string;
  description?: string | null;
  documentCount?: number;
  quizCount?: number;
  objectiveCount?: number;
  avgMastery?: number;
  chapters?: Chapter[];
};

export type Chapter = {
  id: string;
  subject_id: string;
  title: string;
  summary?: string | null;
  position: number;
  objectiveCount?: number;
};

export type Objective = {
  id: string;
  chapter_id: string;
  title: string;
  description?: string | null;
  position: number;
  status: string;
  mastery_score: number;
};

export type DocumentItem = {
  id: string;
  title: string;
  kind: string;
  subject_id: string | null;
  subjectName?: string | null;
  analysis_status: string;
  created_at: string;
  size?: number;
};

export type QuizSummary = {
  id: string;
  title: string;
  origin: string;
  subject_id: string | null;
  subjectName?: string | null;
  questionCount: number;
  attemptCount: number;
  avgPercent: number | null;
  created_at: string;
};

export type Question = {
  id: string;
  type: string;
  prompt: string;
  context?: string | null;
  options: { id: string; text: string }[];
  hint?: string | null;
  points: number;
  difficulty: number;
};

export type Graded = {
  correct: boolean;
  partial?: boolean;
  points: number;
  maxPoints: number;
  explanation: string;
  missing?: string;
  followUp?: string;
  gradedBy: string;
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  mc_single: 'Meerkeuze (één antwoord)',
  mc_multi: 'Meerkeuze (meerdere antwoorden)',
  open: 'Open vraag',
  fill: 'Invulvraag',
  true_false: 'Juist / fout',
  match: 'Koppelvraag',
  sort: 'Sorteervraag',
  drag: 'Sleepvraag',
  numeric: 'Rekenopgave',
  chart: 'Grafiekvraag',
  case: 'Casus',
  application: 'Toepassingsvraag',
  concept: 'Begripsvraag',
  compare: 'Vergelijking',
  steps: 'Stappenplan'
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'Nog niet bestudeerd',
  in_progress: 'In behandeling',
  weak: 'Nog onvoldoende begrepen',
  revising: 'In herhaling',
  almost: 'Bijna beheerst',
  mastered: 'Beheerst'
};

export const STATUS_COLORS: Record<string, string> = {
  new: 'rgb(var(--c-muted) / 0.35)',
  in_progress: 'rgb(var(--c-pastelyellow))',
  weak: 'rgb(var(--c-danger) / 0.55)',
  revising: 'rgb(var(--c-pastelpink))',
  almost: 'rgb(var(--c-accentblue))',
  mastered: 'rgb(var(--c-success) / 0.55)'
};

export const QUIZ_MODE_LABELS: Record<string, string> = {
  practice: 'Oefenmodus',
  exam: 'Examenmodus',
  speed: 'Snelheidsmodus',
  survival: 'Overlevingsmodus',
  weak: 'Zwakke-puntenmodus',
  mastery: 'Beheersingsmodus'
};

export const SUMMARY_KINDS: { value: string; label: string }[] = [
  { value: 'brief', label: 'Beknopte samenvatting' },
  { value: 'detailed', label: 'Uitgebreide samenvatting' },
  { value: 'per_chapter', label: 'Hoofdstuk per hoofdstuk' },
  { value: 'concepts', label: 'Begrippenlijst' },
  { value: 'definitions', label: 'Definities' },
  { value: 'examples', label: 'Voorbeelden' },
  { value: 'formulas', label: 'Formules' },
  { value: 'diagram', label: 'Schema / grafieken' },
  { value: 'mindmap', label: 'Mindmap (tekststructuur)' },
  { value: 'compare', label: 'Vergelijkingen' },
  { value: 'steps', label: 'Stappenplan' },
  { value: 'exercises', label: 'Oefeningen' }
];
