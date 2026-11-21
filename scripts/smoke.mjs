/* End-to-end smoke test van de StudyBase API tegen een gestarte server.
 * Gebruik: npm run build && npm start (aparte terminal) en dan: node scripts/smoke.mjs
 * Werkt uitsluitend op http://localhost:3000 (loopback).
 */
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
let cookie = '';
let failures = 0;

async function call(method, path, body, expectStatus = 200) {
  const res = await fetch(BASE + path, {
    method,
    headers: body instanceof FormData ? (cookie ? { cookie } : {}) : { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch { /* lege body */ }
  if (res.status !== expectStatus) {
    failures++;
    console.error(`FAIL ${method} ${path} -> ${res.status} (verwacht ${expectStatus})`, typeof json?.error === 'string' ? json.error : '');
    return json;
  }
  console.log(`OK   ${method} ${path} -> ${res.status}`);
  return json;
}

const email = `smoke-${Date.now()}@example.test`;
const password = 'SmokeTest!123';

/* 1. Account + aanmelden + uitloggen + opnieuw aanmelden */
await call('POST', '/api/auth/register', { email, password, name: 'Smoke Tester' }, 201);
const me1 = await call('GET', '/api/auth/me');
if (!me1?.user) { failures++; console.error('FAIL gebruiker na registratie ontbreekt'); }
cookie = '';
await call('POST', '/api/auth/login', { email, password: 'FoutWachtwoord1!' }, 401);
await call('POST', '/api/auth/login', { email, password }, 200);
const me2 = await call('GET', '/api/auth/me');
if (!me2?.user) { failures++; console.error('FAIL gebruiker na aanmelding ontbreekt'); }

/* 2. Vak -> hoofdstuk -> leerdoelen + documentupload */
const subj = await call('POST', '/api/subjects', { name: 'Economie (smoke)', color: '#A9C9ED', icon: 'book' }, 201);
const subjectId = subj?.id;
if (!subjectId) { failures++; console.error('FAIL vak niet aangemaakt'); }
const ch = await call('POST', `/api/subjects/${subjectId}/chapters`, { title: 'Thema 2 - BTW-administratie' }, 201);
const chapterId = ch?.id;

const form = new FormData();
form.append('file', new Blob([Buffer.from('BTW-administratie. De btw is een belasting op toegevoegde waarde. 21% hoog tarief, 9% laag tarief. Zonder administratie geen aftrek.')], { type: 'text/plain' }), 'btw.txt');
form.append('subjectId', subjectId);
await call('POST', '/api/documents', form, 201);

const objectives = [];
for (const title of ['21% en 9% tarieven toepassen', 'Wezen van toegevoegde waarde']) {
  const o = await call('POST', '/api/objectives', { chapterId, title }, 201);
  objectives.push(o?.id);
}

/* 3. Bestaande quiz importeren met Nederlands antwoordsleutel-formaat */
const imported = await call('POST', '/api/quizzes/import', {
  title: 'BTW-oefening (geimporteerd)',
  subjectId,
  format: 'text',
  content: 'Vraag 1: Wat is het hoge btw-tarief in Nederland?\na) 21%\nb) 9%\nc) BTW is geen belasting.\n\nVraag 2: Leg uit wat toegevoegde waarde betekent.\n\nAntwoorden:\n1) a'
}, 200);
if (!imported?.id || imported?.questionCount < 1) { failures++; console.error('FAIL import vond geen vragen'); }
else console.log(`   import: ${imported.questionCount} vragen, ${imported.needsReview} ter controle`);

/* 4. Handmatige quiz in de quizmaker */
await call('POST', '/api/quizzes', {
  title: 'Handmatige smokequiz',
  subjectId, chapterId,
  questions: [{
    type: 'mc_single', prompt: 'Wat is toegevoegde waarde?',
    options: [{ id: 'o1', text: 'waarde uit verkopen minus kosten' }, { id: 'o2', text: 'winst' }],
    answer: { correct: 'o1' }, points: 2, difficulty: 2, explanation: 'waardestijging minus kosten.', objectiveIds: objectives[1] ? [objectives[1]] : []
  }]
}, 201);

/* 5. Mastery-quiz: starten -> antwoorden (waaronder 2 fout) -> afronden */
const quizCreate = await call('POST', '/api/quizzes', {
  title: 'Mastery smoke', subjectId, chapterId,
  questions: Array.from({ length: 7 }).map((_, i) => ({
    type: i < 3 ? 'mc_single' : i === 3 ? 'fill' : i === 4 ? 'numeric' : i === 5 ? 'open' : 'case',
    prompt: `Vraag ${i + 1} over tarieven en toegevoegde waarde?`,
    options: [{ id: 'o1', text: '21' }, { id: 'o2', text: '9' }],
    answer: i < 3 ? { correct: 'o1' } : i === 3 ? { accepted: ['21'] } : i === 4 ? { value: 21, tolerance: 0.01 } : { modelAnswer: 'waarde minus invoerkosten', keywords: ['waarde', 'kosten'] },
    points: 2, difficulty: 2, explanation: 'x',
    objectiveIds: objectives[0] ? [objectives[0]] : []
  }))
}, 201);
const quizId2 = quizCreate?.id;

const started = await call('POST', `/api/quizzes/${quizId2}/attempt`, { mode: 'practice', feedbackMode: 'end' }, 201);
const attemptId = started?.attemptId;
const questionsResp = await call('GET', `/api/quizzes/${quizId2}`);
const questions = questionsResp?.questions ?? [];
for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  const wrong = i === 3 || i === 4;
  const answer = q.type === 'mc_single'
    ? { choice: wrong ? 'o2' : 'o1' }
    : q.type === 'fill'
      ? { text: wrong ? '9' : '21' }
      : q.type === 'numeric'
        ? { value: wrong ? 9 : 21 }
        : { text: wrong ? 'helemaal fout' : 'de toegevoegde waarde is waarde minus invoerkosten', selfGrade: 'correct' };
  await call('POST', `/api/attempts/${attemptId}/answer`, { questionId: q.id, answer }, 200);
}
const finished = await call('POST', `/api/attempts/${attemptId}/finish`, {}, 200);
const pct = finished?.report?.percent;
if (pct == null) { failures++; console.error('FAIL geen percentage in rapport'); } else console.log(`   score: ${Math.round(pct)}%`);
if (pct != null && Math.abs(pct - (5 / 7) * 100) > 2.5) { failures++; console.error(`FAIL onverwachte score: ${pct}`); }

/* 6. Flashcards + review (juiste kaart komt niet meteen terug) */
const card = await call('POST', '/api/flashcards', { subjectId, chapterId, front: 'Hoog tarief btw?', back: '21%' }, 201);
const cardId = card?.id;
await call('POST', '/api/flashcards/review', { cardId, grade: 4, objectiveId: objectives[0] }, 200);
const due = await call('GET', '/api/flashcards/due');
if (Array.isArray(due?.due) && due.due.some((d) => d.id === cardId)) { failures++; console.error('FAIL recent juiste kaart zou niet meteen terug moeten komen'); }

/* 7. Planner + kalender + examens */
await call('POST', '/api/planner/generate', { days: 7, minutesPerDay: 60, subjectId }, 200);
await call('POST', '/api/calendar', { title: 'Examen BTW', kind: 'exam', date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) }, 201);
await call('POST', '/api/exams', { title: 'Centraal examen (smoke)', subjectId, examDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, 201);

/* 8. Focus, statistieken, zoeken, export, back-up */
await call('POST', '/api/tools/focus', { minutes: 25 }, 200);
const stats = await call('GET', '/api/stats?dashboard=1');
if ((stats?.totals?.quizCount ?? 0) < 1) { failures++; console.error('FAIL quiztelling in stats ontbreekt'); }
await call('GET', '/api/search?q=btw');
await call('GET', '/api/export?kind=full');
await call('GET', '/api/backup');

/* 9. Foutbibliotheek: vragen 4-7 waren fout */
const mistakes = await call('GET', '/api/mistakes');
const wrongCount = (mistakes?.mistakes ?? []).length;
console.log(`   foutbibliotheek: ${wrongCount} fout(en) geregistreerd`);
if (wrongCount < 2) { failures++; console.error('FAIL foutbibliotheek zou minimaal 2 fouten moeten bevatten'); }

/* 10. App import (HTML) + sandbox ophalen */
const htmlForm = new FormData();
htmlForm.append('file', new Blob([Buffer.from('<!doctype html><html><body><h1>BTW-minigame</h1><script>console.log("x")</script></body></html>')], { type: 'text/html' }), 'game.html');
const app = await call('POST', '/api/apps', htmlForm, 201);
const appId = app?.id;
if (appId) await call('GET', `/api/apps/${appId}/serve`);

/* 11. Instellingen + uitloggen */
await call('PATCH', '/api/settings', { theme: 'dark', dailyGoalMinutes: 60 }, 200);
await call('POST', '/api/auth/logout', {}, 200);

console.log(failures ? `\n${failures} STAP(PEN) GEFAALD - zie hierboven.` : '\nALLES OK - alle smoke-stappen geslaagd.');
process.exit(failures ? 1 : 0);
