import { requireUser, isUser, ok, fail, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { recordMasteryEvent, recalcMasteryForQuizAnswers } from '@/lib/mastery';
import { awardXp } from '@/lib/gamification';
import { id as genId } from '@/lib/auth';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const db = getDb();

    const attempt = db.prepare(
      `SELECT a.*, q.title quizTitle FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id = ? AND a.user_id = ? AND a.status = 'in_progress'`
    ).get(id, u.id) as
      | { id: string; quiz_id: string; quizTitle: string; mode: string; snapshot: string; user_id: string }
      | undefined;
    if (!attempt) return fail('Poging niet gevonden of al afgerond.', 404);

    const snapshot = JSON.parse(attempt.snapshot) as { order: string[] };
    const saved = db.prepare('SELECT question_id, answer, graded, time_ms FROM attempt_answers WHERE attempt_id = ?').all(id) as
      | { question_id: string; answer: string; graded: string | null; time_ms: number | null }[];
    const savedMap = new Map(saved.map((s) => [s.question_id, s]));

    let score = 0;
    let maxScore = 0;
    let durationS = 0;
    const answeredIds = new Set<string>();

    for (const qid of snapshot.order) {
      const q = db.prepare('SELECT id, points FROM questions WHERE id = ?').get(qid) as { id: string; points: number } | undefined;
      if (!q) continue;
      maxScore += q.points;
      const save = savedMap.get(qid);
      if (save) {
        answeredIds.add(qid);
        durationS += Math.round((save.time_ms ?? 0) / 1000);
        if (save.graded) score += (JSON.parse(save.graded) as { points: number }).points ?? 0;
      }
    }
    score = Math.round(score * 100) / 100;
    const unanswered = snapshot.order.filter((qid) => !answeredIds.has(qid)).length;
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    db.prepare(`UPDATE attempts SET status = 'finished', score = ?, max_score = ?, percent = ?, duration_s = ?, finished_at = datetime('now') WHERE id = ?`).run(
      score, maxScore, percent, durationS, id
    );

    const perObjective: Record<string, { correct: number; total: number }> = {};
    const masteryObjectives: string[] = [];
    for (const qid of snapshot.order) {
      if (!answeredIds.has(qid)) continue;
      const q = db.prepare('SELECT points, difficulty, type, objective_ids FROM questions WHERE id = ?').get(qid) as
        | { points: number; difficulty: number; type: string; objective_ids: string } | undefined;
      const save = savedMap.get(qid);
      const graded = save?.graded ? JSON.parse(save.graded) as { correct: boolean; points: number; maxPoints: number } : null;
      if (!q || !graded) continue;
      const objectiveIds = JSON.parse(q.objective_ids) as string[];
      for (const oid of objectiveIds) {
        recordMasteryEvent({
          userId: u.id,
          objectiveId: oid,
          source: attempt.mode === 'exam' || attempt.mode === 'speed' ? 'exam' : 'quiz',
          sourceId: id,
          questionType: q.type as never,
          correctness: Math.max(0, Math.min(1, graded.points / Math.max(1, graded.maxPoints))),
          difficulty: q.difficulty,
          autonomy: (save?.answer as { hintUsed?: boolean } | null)?.hintUsed ? 'hint_used' : 'independent'
        });
        perObjective[oid] = perObjective[oid] ?? { correct: 0, total: 0 };
        perObjective[oid].total += 1;
        if (graded.correct) perObjective[oid].correct += 1;
        if (!masteryObjectives.includes(oid)) masteryObjectives.push(oid);
      }
    }
    recalcMasteryForQuizAnswers(u.id, masteryObjectives);

    for (const oid of masteryObjectives) {
      const row = db.prepare(`SELECT status FROM objectives WHERE id = ? AND user_id = ?`).get(oid, u.id) as { status: string } | undefined;
      if (row?.status === 'mastered') {
        const before = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND kind = 'objective_mastered' AND payload LIKE ?`).get(u.id, `%"${oid}"%`) as { c: number };
        if (before.c === 0) awardXp(u.id, 'objective_mastered');
        db.prepare(`INSERT INTO events (id, user_id, kind, minutes, xp, payload) VALUES (?,?,?,0,0,?)`).run(
          genId('ev_'), u.id, 'objective_mastered', JSON.stringify({ objectiveId: oid })
        );
      }
    }
    awardXp(u.id, 'quiz_completed', { minutes: durationS, scaled: percent / 10 });

    const perChapterRows = db.prepare(
      `SELECT COALESCE(c.title, 'Geen hoofdstuk') chapter, JSON_GROUP_ARRAY(q.id) ids FROM questions q LEFT JOIN chapters c ON c.id = q.chapter_id WHERE q.quiz_id = ? GROUP BY q.chapter_id`
    ).all(attempt.quiz_id) as { chapter: string; ids: string }[];

    const wrongAnswerIds: { questionId: string; prompt: string; userAnswer: unknown; graded: { correct: boolean; partial: boolean; points: number; maxPoints: number; explanation: string; missing?: string; followUp?: string; gradedBy: string }; maxPoints: number; explanation: string | null; objectiveId: string | null; correctText: string }[] = [];
    const perChapter = perChapterRows.map((row) => {
      const ids = JSON.parse(row.ids) as string[];
      let got = 0;
      let max = 0;
      for (const qid of ids) {
        const q = db.prepare('SELECT points, prompt, explanation, objective_ids, type, options, answer FROM questions WHERE id = ?').get(qid) as
          | { points: number; prompt: string; explanation: string | null; objective_ids: string; type: string; options: string; answer: string } | undefined;
        if (!q) continue;
        max += q.points;
        const save = savedMap.get(qid);
        const graded = save?.graded ? JSON.parse(save.graded) as { correct: boolean; partial: boolean; points: number; maxPoints: number; explanation: string; missing?: string; followUp?: string; gradedBy: string } : null;
        if (save?.graded && graded) got += graded.points ?? 0;
        else if (save?.graded) got += 0;
        if (graded && save?.graded && !graded.correct && !graded.partial) {
          if (!graded.partial && graded.points < graded.maxPoints) {
            const objectiveId = (JSON.parse(q.objective_ids) as string[])[0] ?? null;
            wrongAnswerIds.push({ questionId: qid, prompt: q.prompt, userAnswer: save?.answer, graded, maxPoints: q.points, explanation: q.explanation, objectiveId, correctText: describeCorrectAnswer(q.type, q.options, q.answer) });
          }
        }
      }
      return { chapter: row.chapter, percent: max > 0 ? Math.round((got / max) * 100) : 0 };
    });

    for (const w of wrongAnswerIds) {
      const existing = db.prepare('SELECT id, count FROM mistakes WHERE user_id = ? AND question_text = ?').get(u.id, w.prompt) as { id: string; count: number } | undefined;
      if (existing) {
        db.prepare(`UPDATE mistakes SET count = count + 1, last_practiced_at = datetime('now'), user_answer = ? WHERE id = ?`).run(
          JSON.stringify(w.userAnswer), existing.id
        );
        if (w.objectiveId) upsertPattern(db, u.id, w.objectiveId);
        continue;
      }
      let objectiveId = w.objectiveId ?? null;
      const qor = db.prepare('SELECT objective_ids FROM questions WHERE id = ?').get(w.questionId) as { objective_ids: string } | undefined;
      if (!objectiveId && qor) objectiveId = (JSON.parse(qor.objective_ids) as string[])[0] ?? null;
      db.prepare("INSERT INTO mistakes (id, user_id, objective_id, question_text, user_answer, correct_answer, explanation, count) VALUES (?,?,?,?,?,?,?,1)").run(
        genId('m_'), u.id, objectiveId, w.prompt, JSON.stringify(w.userAnswer), w.correctText || w.graded.explanation || null, w.explanation ?? null
      );
      if (objectiveId) upsertPattern(db, u.id, objectiveId);
    }

    return ok({
      report: {
        attemptId: id,
        score,
        maxScore,
        percent,
        durationS,
        unanswered,
        perChapter,
        perObjective: Object.entries(perObjective).map(([oid, v]) => ({
          objectiveId: oid,
          percent: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0
        })),
        wrong: wrongAnswerIds
      }
    });
  });
}

function upsertPattern(db: ReturnType<typeof getDb>, userId: string, objectiveId: string) {
  const o = db.prepare('SELECT title FROM objectives WHERE id = ? AND user_id = ?').get(objectiveId, userId) as { title: string } | undefined;
  if (!o) return;
  db.prepare(
    "INSERT INTO mistakes_patterns (id, user_id, objective_id, pattern, occurrences, last_seen) VALUES (?,?,?,?,1,datetime('now')) " +
    'ON CONFLICT(user_id, objective_id) WHERE objective_id IS NOT NULL DO UPDATE SET occurrences = occurrences + 1, last_seen = datetime(\'now\')'
  ).run(genId('mp_'), userId, objectiveId, o.title);
}

/** Maakt van het interne antwoordmodel een leesbaar correct antwoord. */
function describeCorrectAnswer(type: string, optionsJson: string, answerJson: string): string {
  try {
    const answer = JSON.parse(answerJson) as Record<string, unknown>;
    const options = JSON.parse(optionsJson || '[]') as { id: string; text: string }[];
    const optText = (oid: string) => options.find((o) => o.id === oid)?.text ?? oid;
    if (type === 'mc_single' && typeof answer.correct === 'string') return optText(answer.correct);
    if (type === 'mc_multi' && Array.isArray(answer.correct)) return (answer.correct as string[]).map(optText).join(', ');
    if (type === 'true_false') return answer.correct === true ? 'Juist' : 'Fout';
    if (type === 'fill' && Array.isArray(answer.accepted)) return (answer.accepted as string[]).join(' / ');
    if (type === 'numeric') return `${answer.value}${answer.unit ? ' ' + answer.unit : ''}`;
    if (type === 'match' && Array.isArray(answer.pairs)) return (answer.pairs as { left: string; right: string }[]).map((p) => `${p.left} → ${p.right}`).join('; ');
    if (type === 'sort' && Array.isArray(answer.items)) return (answer.items as { text: string; position: number }[]).slice().sort((x, y) => x.position - y.position).map((i) => i.text).join(' → ');
    if (type === 'drag' && Array.isArray(answer.items)) return (answer.items as { text: string; category: string }[]).map((i) => `${i.text} (${i.category})`).join('; ');
    if (typeof answer.modelAnswer === 'string') return answer.modelAnswer;
    return JSON.stringify(answer).slice(0, 300);
  } catch {
    return '';
  }
}
