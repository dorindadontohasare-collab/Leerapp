/**
 * StudyBase Integratie-API v1.0
 * Gestructureerd resultaatformaat dat een geïmporteerde app via
 * window.postMessage naar het hoofdplatform kan sturen.
 *
 * protocol: "studybase-integration/1.0"
 * Type "result"     : één resultaatobject per vraag of oefening
 * Type "summary"    : eindsamenvatting van een poging
 * Type "ready"      : signaleert dat de app geïntegreerd is
 */

export type AppResultPayload = {
  appId: string;
  attemptId?: string;
  subjectId?: string;
  chapterId?: string;
  objectiveIds?: string[];
  questionId?: string;
  question?: string;
  answer?: string;
  isCorrect?: boolean;
  score?: number;
  timeS?: number;
  completedAt?: string;
};

export type AppSummaryPayload = {
  appId: string;
  attemptId?: string;
  score?: number;
  maxScore?: number;
  timeS?: number;
  completedAt?: string;
};

export const APP_PROTOCOL_VERSION = '1.0';

export interface AppIntegrationVersion {
  version: '1.0';
  url: string;
  script: string;
}

function isText(v: unknown, min = 0, max = 5000): boolean {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

export interface ValidatedMessage {
  valid: true;
  type: 'result' | 'summary' | 'ready';
  payload: Record<string, unknown>;
}

export interface InvalidMessage {
  valid: false;
  reason: string;
}

/**
 * Valideert een postMessage van binnen een sandboxed iframe.
 * Taken die buiten de regels vallen worden afgewezen en niet verwerkt.
 */
export function validateAppMessage(raw: unknown): ValidatedMessage | InvalidMessage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { valid: false, reason: 'onjuist berichttype' };
  const msg = raw as Record<string, unknown>;
  if (msg.protocol !== `studybase-integration/${APP_PROTOCOL_VERSION}`) {
    return { valid: false, reason: 'onbekend of ontbrekend protocol' };
  }
  const type = msg.type;
  if (type === 'ready') {
    return { valid: true, type, payload: {} };
  }
  if (!isText(msg.appId, 1, 200)) return { valid: false, reason: 'appId ontbreekt' };
  if (type === 'result') {
    if (msg.isCorrect != null && typeof msg.isCorrect !== 'boolean') return { valid: false, reason: 'isCorrect moet boolean zijn' };
    if (msg.score != null && (typeof msg.score !== 'number' || !Number.isFinite(msg.score))) return { valid: false, reason: 'score moet getal zijn' };
    if (msg.isCorrect == null && msg.score == null) return { valid: false, reason: 'result past niet: geef isCorrect of score' };
    return { valid: true, type, payload: msg };
  }
  if (type === 'summary') {
    return { valid: true, type, payload: msg };
  }
  return { valid: false, reason: 'onbekend berichttype' };
}

/** Velden die aanvaard worden in het resultaatobject. */
export const RESULT_FIELDS = [
  'appId', 'attemptId', 'subjectId', 'chapterId', 'objectiveIds', 'questionId', 'question', 'answer', 'isCorrect', 'score', 'timeS', 'completedAt'
] as const;
