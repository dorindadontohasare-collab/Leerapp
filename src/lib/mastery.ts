import { getDb } from './db';
import { id } from './auth';
import type { ObjectiveStatus, QuestionType } from './types';

/**
 * Beheersingsengine.
 *
 * Een leerdoel mag pas "beheerst" zijn als er voldoende bewijs is uit
 * meerdere vraagtypes en momenten. De score is transparant opgebouwd uit
 * gewogen relevante gebeurtenissen (mastery_events) met:
 *  - correctness (0..1) per gebeurtenis
 *  - gewicht per vraagtype (herkennen < begrijpen < toepassen)
 *  - gewicht voor moeilijkheid (1..3) en zelfstandigheid
 *  - demping van oude gebeurtenissen (recency) zodat recente prestaties
 *    zwaarder tellen dan oude.
 */

const TYPE_WEIGHT: Partial<Record<QuestionType, number>> = {
  mc_single: 0.7,
  mc_multi: 0.8,
  true_false: 0.6,
  fill: 0.85,
  match: 0.8,
  sort: 0.8,
  drag: 0.8,
  numeric: 1.0,
  chart: 1.0,
  open: 1.1,
  case: 1.2,
  application: 1.15,
  concept: 0.85,
  compare: 1.0,
  steps: 1.1
};

const SOURCE_WEIGHT: Record<string, number> = {
  quiz: 1,
  imported_quiz: 1,
  app: 0.9,
  flashcard: 0.6,
  oral: 1,
  exam: 1.3
};

const AUTONOMY_WEIGHT: Record<string, number> = {
  independent: 1.1,
  hint_used: 0.85,
  assisted: 0.7,
  self_assessed: 0.75
};

const HALF_LIFE_DAYS = 21;

export function recordMasteryEvent(input: {
  userId: string;
  objectiveId: string | null;
  source: 'quiz' | 'imported_quiz' | 'app' | 'flashcard' | 'oral' | 'exam';
  sourceId?: string;
  questionType?: QuestionType;
  correctness: number;
  difficulty?: number;
  autonomy?: string;
}): void {
  if (!input.objectiveId) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO mastery_events (id, user_id, objective_id, source, source_id, question_type, correctness, difficulty, autonomy)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id('me_'),
    input.userId,
    input.objectiveId,
    input.source,
    input.sourceId ?? null,
    input.questionType ?? null,
    Math.max(0, Math.min(1, input.correctness)),
    input.difficulty ?? 2,
    input.autonomy ?? 'assisted'
  );
}

function statusFor(score: number, count: number, distinctTypes: number): ObjectiveStatus {
  if (count === 0) return 'new';
  if (score >= 85 && distinctTypes >= 3 && count >= 6) return 'mastered';
  if (score >= 70) return 'almost';
  if (score >= 55) return 'revising';
  if (score >= 30) return 'in_progress';
  return 'weak';
}

export interface MasteryDetail {
  score: number;
  status: ObjectiveStatus;
  evidence: { count: number; distinctTypes: number; avgCorrectness: number; recentCorrectness: number };
  reasons: string[];
}

export function recalcMastery(userId: string, objectiveId: string): MasteryDetail {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT question_type, correctness, difficulty, autonomy, source, at FROM mastery_events WHERE user_id = ? AND objective_id = ? ORDER BY at ASC'
    )
    .all(userId, objectiveId) as { question_type: string | null; correctness: number; difficulty: number; autonomy: string; source: string; at: string }[];

  const now = Date.now();
  let weightedSum = 0;
  let weightTotal = 0;

  for (const r of rows) {
    const typeW = TYPE_WEIGHT[(r.question_type ?? '') as QuestionType] ?? 0.8;
    const srcW = SOURCE_WEIGHT[r.source] ?? 1;
    const autoW = AUTONOMY_WEIGHT[r.autonomy] ?? 0.75;
    const diffW = 0.8 + (r.difficulty - 1) * 0.15;
    const ageDays = Math.max(0, (now - new Date(r.at.replace(' ', 'T') + 'Z').getTime()) / 86400000);
    const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const w = typeW * srcW * autoW * diffW * (0.35 + 0.65 * recency);
    weightedSum += r.correctness * w;
    weightTotal += w;
  }

  /*
   * Bewijsfactor: een hoge gemiddelde correctheid weegt minder zwaar zolang er
   * weinig gebeurtenissen of weinig verschillende vraagtypes zijn. Eén juist
   * meerkeuzeantwoord kan zo nooit (bijna) volledige beheersing suggereren.
   */
  const distinctTypesRows = new Set(rows.map((r) => r.question_type ?? '').filter(Boolean)).size;
  const coverageCount = Math.min(rows.length / 6, 1);
  const coverageTypes = Math.min(distinctTypesRows / 3, 1);
  const evidenceFactor = 0.5 + 0.5 * (0.6 * coverageCount + 0.4 * coverageTypes);
  const score = weightTotal > 0
    ? Math.round((weightedSum / weightTotal) * evidenceFactor * 100)
    : 0;
  const avg = rows.length ? rows.reduce((s, r) => s + r.correctness, 0) / rows.length : 0;
  const recent = rows.slice(-3);
  const recentAvg = recent.length ? recent.reduce((s, r) => s + r.correctness, 0) / recent.length : 0;
  const distinctTypes = new Set(rows.map((r) => r.question_type ?? '').filter(Boolean)).size;
  const status = statusFor(score, rows.length, distinctTypes);

  const reasons: string[] = [];
  const failed = rows.filter((r) => r.correctness < 0.5).length;
  reasons.push(`${rows.length} bewijsmoment(en) over ${distinctTypes} verschillende vraagtype(s).`);
  if (recentAvg > avg + 0.1) reasons.push('Recente prestaties liggen boven het gemiddelde: vooruitgang.');
  if (recentAvg < avg - 0.1) reasons.push('Recente prestaties liggen onder het gemiddelde: extra herhaling nodig.');
  if (failed > 0) reasons.push(`${failed} fout(e) die meewegen in de score.`);
  if (status === 'mastered') reasons.push('Voldoende bewijs uit meerdere vraagtypes en momenten.');
  else if (distinctTypes < 3) reasons.push('Nog te weinig verschillende vraagtypes voor volledige beheersing.');
  else if (rows.length < 6) reasons.push('Nog te weinig herhalingen voor volledige beheersing.');

  const detail: MasteryDetail = { score, status, evidence: { count: rows.length, distinctTypes, avgCorrectness: Math.round(avg * 100), recentCorrectness: Math.round(recentAvg * 100) }, reasons };

  db.prepare("UPDATE objectives SET mastery_score = ?, status = ?, mastery_detail = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(
    score,
    status,
    JSON.stringify(detail),
    objectiveId,
    userId
  );
  return detail;
}

export function recalcMasteryForQuizAnswers(userId: string, objectiveIds: string[]): void {
  for (const oid of new Set(objectiveIds)) {
    if (oid) recalcMastery(userId, oid);
  }
}
