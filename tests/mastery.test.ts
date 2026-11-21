import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/lib/db';
import { recordMasteryEvent, recalcMastery } from '../src/lib/mastery';
import { id } from '../src/lib/auth';

const db = getDb();
const uid = id('u_t');
const sid = id('s_t');
const cid = id('c_t');

function setup() {
  db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").run(uid, `masterytest-${uid}@example.test`, 'Mastery Test');
  db.prepare('INSERT INTO subjects (id, user_id, name) VALUES (?,?,?)').run(sid, uid, 'Testvak');
  db.prepare('INSERT INTO chapters (id, user_id, subject_id, title) VALUES (?,?,?,?)').run(cid, uid, sid, 'H1');
}

function addObjective(title: string): string {
  const oid = id('o_t');
  db.prepare("INSERT INTO objectives (id, user_id, subject_id, chapter_id, title) VALUES (?,?,?,?,?)").run(oid, uid, sid, cid, title);
  return oid;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

/* Bepaalde gebeurtenissen met terugwerkende kracht toevoegen. */
function recordAt(objectiveId: string, source: string, type: string, correctness: number, difficulty: number, at: string, autonomy = 'independent') {
  db.prepare(
    "INSERT INTO mastery_events (id, user_id, objective_id, source, question_type, correctness, difficulty, autonomy, at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id('me_'), uid, objectiveId, source, type, correctness, difficulty, autonomy, at);
}

afterAll(() => {
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
});

describe('beheersingsengine (mastery)', () => {
  setup();

  it('één juist meerkeuzeantwoord mag nooit tot beheerst leiden', () => {
    const oid = addObjective('Eén MC-antwoord');
    recordMasteryEvent({ userId: uid, objectiveId: oid, source: 'quiz', questionType: 'mc_single', correctness: 1, difficulty: 2, autonomy: 'independent' });
    const r = recalcMastery(uid, oid);
    expect(r.status).not.toBe('mastered');
    expect(r.score).toBeLessThan(85);
  });

  it('eerst juiste definitievraag, dan foute toepassing: nog niet beheerst, wel in_progress/weak-niveau', () => {
    const oid = addObjective('Prijselasticiteit');
    recordAt(oid, 'quiz', 'concept', 1, 2, daysAgo(3));
    recordAt(oid, 'quiz', 'application', 0, 3, daysAgo(2));
    recordAt(oid, 'quiz', 'numeric', 1, 2, daysAgo(1));
    const r = recalcMastery(uid, oid);
    expect(r.status).not.toBe('mastered');
    expect(r.evidence.count).toBe(3);
    expect(r.evidence.distinctTypes).toBe(3);
  });

  it('85%+ score met ≥3 types en ≥6 gebeurtenissen geeft beheerst', () => {
    const oid = addObjective('Volledig geoefend leerdoel');
    const types = ['mc_single', 'open', 'numeric', 'case', 'fill', 'application', 'compare'];
    types.forEach((t, i) => recordAt(oid, 'quiz', t, 1, 3, daysAgo(i)));
    const r = recalcMastery(uid, oid);
    expect(r.status).toBe('mastered');
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.evidence.distinctTypes).toBeGreaterThanOrEqual(3);
    expect(r.evidence.count).toBeGreaterThanOrEqual(6);
  });

  it('hoge score met te weinig verschillende types blijft "bijna beheerst"', () => {
    const oid = addObjective('Alleen meerkeuze geproefd');
    for (let i = 0; i < 8; i++) recordAt(oid, 'quiz', 'mc_single', 1, 3, daysAgo(i));
    const r = recalcMastery(uid, oid);
    expect(r.status).toBe('almost');
    expect(r.reasons.join(' ')).toMatch(/type/i);
  });

  it('recency: recente foute prestatie verlaagt de score meer dan een oude', () => {
    const old = addObjective('Oude fout');
    const fresh = addObjective('Recente fout');
    for (let i = 0; i < 6; i++) {
      recordAt(old, 'quiz', 'open', 1, 2, daysAgo(10 + i));
    }
    recordAt(old, 'quiz', 'open', 0, 2, daysAgo(20));
    for (let i = 0; i < 6; i++) {
      recordAt(fresh, 'quiz', 'open', 1, 2, daysAgo(10 + i));
    }
    recordAt(fresh, 'quiz', 'open', 0, 2, daysAgo(0));
    const rOld = recalcMastery(uid, old);
    const rFresh = recalcMastery(uid, fresh);
    expect(rOld.score).toBeGreaterThan(rFresh.score);
  });

  it('redenering is transparant: elke score heeft zichtbare evidence', () => {
    const oid = addObjective('Transparantie');
    recordAt(oid, 'quiz', 'fill', 1, 2, daysAgo(1), 'hint_used');
    const r = recalcMastery(uid, oid);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.evidence.count).toBe(1);
    expect(Array.isArray(r.reasons)).toBe(true);
  });
});
