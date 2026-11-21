export const QUESTION_TYPES = [
  'mc_single',
  'mc_multi',
  'open',
  'fill',
  'true_false',
  'match',
  'sort',
  'drag',
  'numeric',
  'chart',
  'case',
  'application',
  'concept',
  'compare',
  'steps'
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mc_single: 'Meerkeuze (één antwoord)',
  mc_multi: 'Meerkeuze (meerdere antwoorden)',
  open: 'Open vraag',
  fill: 'Invulvraag',
  true_false: 'Juist / fout',
  match: 'Koppelvraag',
  sort: 'Sorteervraag',
  drag: 'Sleepvraag (categorieën)',
  numeric: 'Rekenopgave',
  chart: 'Grafiekvraag',
  case: 'Casus',
  application: 'Toepassingsvraag',
  concept: 'Begripsvraag',
  compare: 'Vergelijkingsvraag',
  steps: 'Stapsgewijze oefening'
};

export const OBJECTIVE_STATUS = [
  'new',
  'in_progress',
  'weak',
  'revising',
  'almost',
  'mastered'
] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUS)[number];

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  new: 'Nog niet bestudeerd',
  in_progress: 'In behandeling',
  weak: 'Nog onvoldoende begrepen',
  revising: 'In herhaling',
  almost: 'Bijna beheerst',
  mastered: 'Beheerst'
};

export const QUIZ_MODES = ['practice', 'exam', 'speed', 'survival', 'weak', 'mastery'] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];

export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  practice: 'Oefenmodus',
  exam: 'Examenmodus',
  speed: 'Snelheidsmodus',
  survival: 'Overlevingsmodus',
  weak: 'Zwakke-puntenmodus',
  mastery: 'Beheersingsmodus'
};

export const DOCUMENT_KINDS = [
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'md', 'csv', 'image', 'text', 'youtube', 'url'
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type SourceRef = {
  documentId?: string;
  documentTitle?: string;
  chapter?: string;
  page?: number;
  fragment?: string;
  origin: 'course' | 'ai' | 'background';
};

export type McOption = { id: string; text: string; correct?: boolean };

export type MatchPair = { left: string; right: string };
export type DragItem = { id: string; text: string; category: string };
export type SortItem = { id: string; text: string; position: number };
export type ChartData = { title: string; labels: string[]; series: { name: string; values: number[] }[]; question: string };

export type QuestionAnswer =
  | { choice: string }
  | { choices: string[] }
  | { text: string }
  | { pairs: MatchPair[] }
  | { order: string[] }
  | { assignment: Record<string, string> }
  | { value: number }
  | { selfGrade?: 'correct' | 'partial' | 'wrong'; text: string };

export type GradedResult = {
  correct: boolean;
  partial: boolean;
  points: number;
  maxPoints: number;
  explanation: string;
  missing?: string;
  followUp?: string;
  gradedBy: 'exact' | 'heuristic' | 'ai' | 'self';
};

export const STATUS_COLORS: Record<ObjectiveStatus, string> = {
  new: '#A9C9ED',
  in_progress: '#7FA7D9',
  weak: '#D9534F',
  revising: '#F7D488',
  almost: '#9CCFA0',
  mastered: '#3D9A6C'
};
