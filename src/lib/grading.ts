import type { GradedResult, McOption, DragItem, SortItem, MatchPair } from './types';
import type { OpenGrading } from './ai/tasks';

export interface QuestionShape {
  type: string;
  prompt: string;
  options: McOption[];
  answer: Record<string, unknown>;
  points: number;
  explanation?: string;
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ');
}

/** Exacte/deterministische beoordeling voor objectieve vraagtypes. */
export function gradeObjective(question: QuestionShape, answer: Record<string, unknown>): GradedResult {
  const max = question.points;
  const base = (correct: boolean): GradedResult => ({
    correct,
    partial: false,
    points: correct ? max : 0,
    maxPoints: max,
    explanation: question.explanation ?? '',
    gradedBy: 'exact'
  });

  switch (question.type) {
    case 'mc_single':
    case 'true_false': {
      const a = answer as { choice?: string };
      const expectedRaw = (question.answer as { correct: string | boolean }).correct;
      if (typeof expectedRaw === 'boolean') {
        /* true_false met boolean-antwoord: match de optie via de tekst Juist/Fout */
        const chosen = question.options.find((o) => o.id === a.choice);
        const isTrueOption = !!chosen && /^juist|waar|true/i.test(chosen.text);
        return base(expectedRaw === isTrueOption);
      }
      return base(a.choice === expectedRaw);
    }
    case 'mc_multi': {
      const a = answer as { choices?: string[] };
      const expected = (question.answer as { correct: string[] }).correct ?? [];
      const given = a.choices ?? [];
      const setA = new Set(given);
      const setE = new Set(expected);
      const perfect = setA.size === setE.size && [...setE].every((x) => setA.has(x));
      if (perfect) return base(true);
      const hit = given.filter((g) => setE.has(g)).length;
      const missed = [...setE].filter((e) => !setA.has(e)).length;
      const wrongPicks = given.filter((g) => !setE.has(g)).length;
      const points = Math.max(0, (hit - wrongPicks) / setE.size) * max;
      return {
        correct: false,
        partial: hit > 0 && wrongPicks === 0 && missed > 0,
        points: Math.round(points * 100) / 100,
        maxPoints: max,
        explanation: question.explanation ? question.explanation + ' ' : `Correct waren: ${[...setE].join(', ')}`,
        gradedBy: 'exact'
      };
    }
    case 'fill':
    case 'concept': {
      const a = answer as { text?: string };
      const accepted = ((question.answer as { accepted?: string[] }).accepted ?? []).map(norm);
      if (accepted.length === 0) return gradeSelfFallback(question, answer, max);
      const ok = accepted.includes(norm(a.text ?? ''));
      return { correct: ok, partial: false, points: ok ? max : 0, maxPoints: max, explanation: question.explanation ?? '', gradedBy: 'exact' };
    }
    case 'numeric': {
      const a = answer as { value?: number };
      const expected = question.answer as { value: number; tolerance?: number };
      const tol = expected.tolerance ?? 0.001;
      const correct = a.value != null && !Number.isNaN(a.value) && Math.abs(a.value - expected.value) <= Math.max(Math.abs(expected.value) * tol, tol);
      return base(correct);
    }
    case 'match': {
      const a = answer as { pairs?: MatchPair[] };
      const expected = (question.answer as { pairs: MatchPair[] }).pairs ?? [];
      let hit = 0;
      for (const exp of expected) {
        const given = (a.pairs ?? []).find((p) => p.left === exp.left);
        if (given && given.right === exp.right) hit += 1;
      }
      const points = (hit / Math.max(1, expected.length)) * max;
      return { correct: hit === expected.length, partial: hit > 0 && hit < expected.length, points: Math.round(points * 100) / 100, maxPoints: max, explanation: question.explanation ?? '', gradedBy: 'exact' };
    }
    case 'sort': {
      const a = answer as { order?: string[] };
      const expected = ((question.answer as { items: SortItem[] }).items ?? []).slice().sort((x, y) => x.position - y.position).map((i) => i.id);
      const given = a.order ?? [];
      let hit = 0;
      expected.forEach((eid, i) => { if (given[i] === eid) hit += 1; });
      const points = (hit / Math.max(1, expected.length)) * max;
      return { correct: expected.length === given.length && expected.every((eid, i) => given[i] === eid), partial: hit > 0 && hit < expected.length, points: Math.round(points * 100) / 100, maxPoints: max, explanation: question.explanation ?? '', gradedBy: 'exact' };
    }
    case 'drag': {
      const a = answer as { assignment?: Record<string, string> };
      const expected = (question.answer as { items: DragItem[] }).items ?? [];
      let hit = 0;
      for (const item of expected) {
        if ((a.assignment ?? {})[item.id] === item.category) hit += 1;
      }
      const points = (hit / Math.max(1, expected.length)) * max;
      return { correct: hit === expected.length, partial: hit > 0 && hit < expected.length, points: Math.round(points * 100) / 100, maxPoints: max, explanation: question.explanation ?? '', gradedBy: 'exact' };
    }
    case 'chart': {
      const answerField = question.answer as { correct?: string };
      const a = answer as { choice?: string };
      if (answerField.correct) return base(a.choice === answerField.correct);
      return gradeSelfFallback(question, answer, max);
    }
    default:
      return gradeSelfFallback(question, answer, max);
  }
}

/** Open types zonder AI-configuratie: zelfbeoordeling met modelantwoord. */
function gradeSelfFallback(question: QuestionShape, answer: Record<string, unknown>, max: number): GradedResult {
  const a = answer as { selfGrade?: string };
  const g = a.selfGrade;
  if (g === 'correct') return { correct: true, partial: false, points: max, maxPoints: max, explanation: 'Zelfbeoordeeld als juist.', gradedBy: 'self' };
  if (g === 'partial') return { correct: false, partial: true, points: Math.round(max * 0.5 * 100) / 100, maxPoints: max, explanation: 'Zelfbeoordeeld als gedeeltelijk juist.', gradedBy: 'self' };
  if (g === 'wrong') return { correct: false, partial: false, points: 0, maxPoints: max, explanation: 'Zelfbeoordeeld als onjuist.', gradedBy: 'self' };
  return {
    correct: false,
    partial: false,
    points: 0,
    maxPoints: max,
    explanation: 'Open antwoord: vergelijk je antwoord met het modelantwoord en beoordeel jezelf.',
    gradedBy: 'self'
  };
}

export function convertAiGrading(questionPoints: number, grading: OpenGrading): GradedResult {
  return {
    correct: grading.correct,
    partial: grading.partial,
    points: Math.round(grading.points * (questionPoints / Math.max(1, grading.maxPoints)) * 100) / 100,
    maxPoints: questionPoints,
    explanation: grading.explanation,
    missing: grading.missing,
    followUp: grading.followUp,
    gradedBy: 'ai'
  };
}

export function isAiOpenType(type: string): boolean {
  return ['open', 'case', 'application', 'compare', 'steps', 'concept', 'numeric', 'fill'].includes(type);
}
