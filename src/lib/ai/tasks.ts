import { callAi, parseJsonLoose, ChatMessage } from './client';
import { getDb } from '../db';
import type { QuestionType } from '../types';

export interface DocumentAnalysis {
  title: string;
  detectedChapters: { title: string; summary: string; keyIdeas: string[] }[];
  concepts: { term: string; definition: string; context: string }[];
  definitions: { term: string; definition: string }[];
  theory: string[];
  examples: string[];
  formulas: { name: string; formula: string; symbols: string; units?: string }[];
  tablesNote: string;
  chartsNote: string;
  exercises: string[];
  relations: string[];
  suggestedObjectives: { title: string; description: string; chapter: string }[];
  gaps: { issue: string; suggestion: string }[];
  unclearPassages: string[];
  completeness: { score: number; notes: string[] };
  language: 'nl' | 'en' | 'fr' | 'other';
}

export async function analyzeDocument(userId: string, documentId: string, userPreference?: string): Promise<DocumentAnalysis> {
  const db = getDb();
  const doc = db.prepare('SELECT title, text FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId) as
    | { title: string; text: string }
    | undefined;
  if (!doc) throw new Error('Document niet gevonden.');

  const sys = `Je bent een didactische documentanalist. Analyseer studiemateriaal en geef ALTIJD een JSON-object dat exact dit schema volgt:
{
 "title": string, "detectedChapters": [{"title": string, "summary": string, "keyIdeas": [string]}],
 "concepts": [{"term": string, "definition": string, "context": string}],
 "definitions": [{"term": string, "definition": string}],
 "theory": [string], "examples": [string],
 "formulas": [{"name": string, "formula": string, "symbols": string, "units": string}],
 "tablesNote": string, "chartsNote": string, "exercises": [string], "relations": [string],
 "suggestedObjectives": [{"title": string, "description": string, "chapter": string}],
 "gaps": [{"issue": string, "suggestion": string}], "unclearPassages": [string],
 "completeness": {"score": number (0-100), "notes": [string]}, "language": "nl"|"en"|"fr"|"other"
}
BELANGRIJK: verzin nooit ontbrekende inhoud. Geef in gaps en unclearPassages eerlijk aan wat niet kon worden gelezen of ontbreekt. Vermeld in completeness.notes expliciet wat niet (volledig) kon worden verwerkt, zoals tabellen, grafieken of afbeeldingen. Antwoord in de taal van het document (of Nederlands bij twijfel).`;

  const { content } = await callAi({
    userId,
    task: 'document_analysis',
    userPreference,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Documenttitel: ${doc.title}\n\nInhoud:\n${doc.text.slice(0, 90000)}\n\nAls dit fragment waarschijnlijk niet het hele document dekt, vermeld dat in completeness.notes.` }
    ],
    responseFormat: 'json',
    maxTokens: 8000
  });
  const parsed = parseJsonLoose<DocumentAnalysis>(content);
  db.prepare('UPDATE documents SET analysis = ?, analysis_status = ?, error = NULL WHERE id = ? AND user_id = ?').run(
    JSON.stringify(parsed), 'done', documentId, userId
  );
  return parsed;
}

// ---------- Quiz generatie ----------

export interface GeneratedQuestion {
  type: QuestionType;
  prompt: string;
  context?: string;
  options?: { id: string; text: string; correct?: boolean }[];
  answer: Record<string, unknown>;
  hint?: string;
  explanation: string;
  points?: number;
  difficulty: 1 | 2 | 3;
  objectiveIds?: string[];
  sourceRef?: { chapter?: string; page?: number; fragment?: string; origin: 'course' | 'ai' | 'background' };
}

export interface GenerateQuizInput {
  subjectName: string;
  chapters: { id: string; title: string }[];
  objectives: { id: string; title: string }[];
  sourceText: string;
  count: number;
  types: QuestionType[];
  difficulty: 'easy' | 'medium' | 'hard' | 'exam';
  language: string;
  existingQuestions?: string[];
}

export async function generateQuizQuestions(userId: string, input: GenerateQuizInput, userPreference?: string): Promise<GeneratedQuestion[]> {
  const sys = `Je bent een hooggekwalificeerde examinator die quizvragen genereert voor een studieplatform.
Geef uitsluitend een JSON-object terug: {"questions": [...]} waarbij elke vraag exact volgt:
{ "type": een van ${JSON.stringify(input.types)}, "prompt": string, "context": string?, "options": [{"id": string, "text": string, "correct": bool}]?, "answer": object, "hint": string?, "explanation": string, "points": number, "difficulty": 1|2|3, "objectiveIds": [string]?, "sourceRef": {"chapter": string?, "page": number?, "fragment": string?, "origin": "course"|"ai"|"background"} }

Antwoordformaat ("answer") per type:
- mc_single: {"correct": "<optionId>"} — opties in "options", IDs o1-o4, één correct
- mc_multi: {"correct": ["<optionId>", ...]} — twee of drie correcte opties
- true_false: {"correct": true|false} — gebruik altijd "options": [{"id":"o1","text":"Juist"},{"id":"o2","text":"Fout"}]
- open / case / application / concept / compare: {"modelAnswer": string, "keywords": [string], "points": [{"part": string, "points": number}]?}
- fill: {"accepted": [string, ...]}
- numeric: {"value": number, "unit": string?, "tolerance": number?, "steps": [string]?}
- match: {"pairs": [{"left": string, "right": string}]}
- sort: {"items": [{"id": string, "text": string, "position": int beginnend bij 0}]}
- drag: {"categories": [string], "items": [{"id": string, "text": string, "category": string}]}
- chart: {"chartData": {"title": str, "labels": [str], "series": [{"name": str, "values": [num]}]}, "answer": {...}, "reason": str} — stel een vraag over de grafiek, answer bv {"correct":"o1"} met opties
- steps: {"steps": [{"title": str, "description": str}], "modelAnswer": str}

REGELS:
1. Baseer inhoud uitsluitend op de aangeleverde leerstof. Geef sourceRef met origin "course" en een korte fragmentverwijzing. Eigen aanvullende uitleg mag, markeer die met origin "ai".
2. Herhaal niet de bestaande vragen.
3. Moeilijkheid: ${input.difficulty === 'hard' ? 'maximaal, toepassingsgericht.' : input.difficulty === 'exam' ? 'examenniveau, realistische puntenverdeling.' : input.difficulty === 'easy' ? 'toegankelijk en fundamenteel.' : 'gemiddeld, met afwisseling.'}
4. Kies per vraag het meest passende vraagtype uit de gevraagde lijst, ten gunste van de stof.
5. Taal: ${input.language}.`;

  const user = `Vak: ${input.subjectName}
Hoofdstukken: ${input.chapters.map((c) => `- [id=${c.id}] ${c.title}`).join('\n') || '-'}
Leerdoelen: ${input.objectives.map((o) => `- [id=${o.id}] ${o.title}`).join('\n') || '-'}
Aantal vragen: ${input.count}
Vraagtypes: ${input.types.join(', ')}
${input.existingQuestions?.length ? `\nBestaande vragen (niet herhalen):\n- ${input.existingQuestions.slice(0, 40).join('\n- ')}` : ''}

Leerstof:
${input.sourceText.slice(0, 70000)}`;

  const { content } = await callAi({
    userId,
    task: 'quiz_generation',
    userPreference,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user.slice(0, 99000) }
    ],
    responseFormat: 'json',
    temperature: 0.4,
    maxTokens: Math.min(16000, 1200 * Math.max(1, input.count) + 2000)
  });
  const parsed = parseJsonLoose<{ questions: GeneratedQuestion[] }>(content);
  return parsed.questions;
}

// ---------- Open antwoorden correctie ----------

export interface OpenGrading {
  correct: boolean;
  partial: boolean;
  points: number;
  maxPoints: number;
  explanation: string;
  missing: string;
  followUp?: string;
  misconception?: string;
}

export async function gradeOpenAnswer(userId: string, payload: {
  prompt: string;
  type: QuestionType;
  modelAnswer: string;
  keywords: string[];
  points: { part: string; points: number }[];
  maxPoints: number;
  studentAnswer: string;
  difficulty: number;
}, userPreference?: string): Promise<OpenGrading> {
  const numeric = payload.type === 'numeric' || payload.type === 'fill';
  const sys = numeric
    ? `Je bent een exacte corrector voor korte antwoorden. Herken synoniemen, alternatieve notaties (komma/punt, eenheden, symbolen) en aanvaard alle inhoudelijk correcte formuleringen.
Geef uitsluitend een JSON-object: {"correct": bool, "partial": bool, "points": number, "maxPoints": ${payload.maxPoints}, "explanation": string, "missing": string, "followUp": string?}`
    : `Je bent een strenge maar eerlijke examinator die open antwoorden inhoudelijk beoordeelt. Redenering en betekenis wegen zwaarder dan exacte woorden; synoniemen en correcte alternatieve formuleringen worden aanvaard.
Geef uitsluitend een JSON-object: {"correct": bool, "partial": bool, "points": number, "maxPoints": ${payload.maxPoints}, "explanation": string, "missing": string, "followUp": string?, "misconception": string?}
Duid in "missing" exact aan wat er in het antwoord ontbreekt; verzin niets.`;

  const parts = payload.points.length ? `\nBeoordelingsonderdelen:\n${payload.points.map((p) => `- ${p.part}: ${p.points} punten`).join('\n')}` : '';
  const { content } = await callAi({
    userId,
    task: 'answer_grading',
    userPreference,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Vraag: ${payload.prompt}\nMoeilijkheid: ${payload.difficulty}/3${parts}\nModelantwoord: ${payload.modelAnswer}\nKernwoorden: ${payload.keywords.join(', ')}\n\nAntwoord student: ${payload.studentAnswer}` }
    ],
    responseFormat: 'json',
    temperature: 0.1,
    maxTokens: 1200
  });
  const parsed = parseJsonLoose<OpenGrading>(content);
  parsed.maxPoints = payload.maxPoints;
  parsed.points = Math.max(0, Math.min(payload.maxPoints, parsed.points));
  return parsed;
}

// ---------- Samenvattingen ----------

export type SummaryKind = 'brief' | 'detailed' | 'per_chapter' | 'concepts' | 'examples' | 'formulas' | 'diagram' | 'steps' | 'exercises' | 'compare' | 'mindmap';

export async function generateSummary(userId: string, payload: {
  title: string;
  text: string;
  kind: SummaryKind;
  detail: 'kort' | 'normaal' | 'uitgebreid';
  language: string;
}, userPreference?: string): Promise<{ markdown: string; sourceRefs: unknown[] }> {
  const instructions: Record<SummaryKind, string> = {
    brief: 'Beknopte samenvatting (max ~300 woorden) met de kernideeën.',
    detailed: 'Uitgebreide samenvatting met alle onderdelen, definities, voorbeelden en formules, met markdown-titels per hoofdstuk.',
    per_chapter: 'Per hoofdstuk een aparte samenvatting, met een titel per hoofdstuk.',
    concepts: 'Begrippenlijst: elk begrip met definitie en eventueel voorbeeld.',
    examples: 'Alle voorbeelden uit de stof, elk met uitleg waarom het illustratief is.',
    formulas: 'Formules: naam, formule, betekenis van symbolen, eenheden, voorbeeldberekening.',
    diagram: 'Vertaal de stof naar een tekstueel schema in een code-block (boomstructuur of flow).',
    mindmap: 'Mindmap als geneste markdown-lijst (hoofdtak → subtak → blad).',
    steps: 'Stappenplan: genummerde stappen om de vaardigheid toe te passen.',
    exercises: 'Oefeningen op basis van de stof, elk met bedoeling (geen antwoorden).',
    compare: 'Vergelijkingstabel (markdown) van de belangrijkste begrippen of benaderingen.'
  };
  const detailScale = { kort: 'korte, kernachtige alineas', normaal: 'evenwichtige diepgang', uitgebreid: 'maximale diepgang, alle nuances' }[payload.detail];

  const { content } = await callAi({
    userId,
    task: 'summarization',
    userPreference,
    messages: [
      { role: 'system', content: `Je bent een didactische samenvatter voor studiemateriaal. Taal: ${payload.language}. ${instructions[payload.kind]} Houd ${detailScale}. Gebruik markdown. Gebruik uitsluitend de aangeleverde stof als inhoudelijke bron en verzin niets. Direct uit de stof afkomstige informatie markeer je als [Bron: fragment/titel]; eigen toelichting van de AI markeer je als _[AI-uitleg]_; algemene achtergrondinformatie als _[Achtergrond]_.` },
      { role: 'user', content: `Titel: ${payload.title}\n\nStof:\n${payload.text.slice(0, 70000)}` }
    ],
    temperature: 0.3,
    maxTokens: 8000
  });
  return { markdown: content, sourceRefs: [{ origin: 'course', fragment: payload.title }] };
}

// ---------- Coach ----------

export interface CoachContext {
  userName: string;
  subject?: { name: string; description?: string | null };
  chapter?: string;
  objectives: { title: string; status: string; score: number }[];
  recentMistakes: { question: string; category: string }[];
  recentAttempts: { quizTitle?: string; title?: string; percent: number; mode: string; at: string }[];
  documentFragment?: string;
  dueCards: number;
  upcomingEvents: string[];
}

export async function coachChat(userId: string, payload: {
  context: CoachContext;
  history: { role: 'user' | 'assistant'; content: string }[];
  message: string;
  settings: { detail?: string; behavior?: string; answerLength?: string };
}, userPreference?: string): Promise<{ reply: string; sources?: unknown[] }> {
  const ctx = payload.context;
  const sys = `Je bent "Studiecoach", de AI-coach van een studieplatform voor student ${ctx.userName}.
Je combineert rollen en kiest bewust per situatie:
- Strenge leerkracht: verwacht precisie, accepteer geen vaagheden.
- Geduldige privétutor: uitleg stap voor stap, eenvoudiger taal wanneer nodig.
- Examinator: stel kritische vervolgvragen, beoordeel redeneringen.
- Persoonlijke studiecoach: concreet, motiverend, altijd met een volgende actie.

Context van deze student:
- Beheersingen: ${ctx.objectives.map((o) => `${o.title} (${o.status}, ${o.score}%)`).join('; ') || 'geen'}
- Recente fouten: ${ctx.recentMistakes.map((m) => `${m.question} [${m.category}]`).join('; ') || 'geen'}
- Recente quizzen: ${ctx.recentAttempts.map((a) => `${a.quizTitle}: ${a.percent}% (${a.mode})`).join('; ') || 'geen'}
- Kaarten te herhalen: ${ctx.dueCards}
- Aankomende momenten: ${ctx.upcomingEvents.join('; ') || 'geen'}
${ctx.chapter ? `- Actueel hoofdstuk: ${ctx.chapter}` : ''}
${ctx.documentFragment ? `- Geselecteerd fragment uit cursusmateriaal:\n"""${ctx.documentFragment.slice(0, 6000)}"""` : ''}

GEbruikersinstellingen: detail ${payload.settings.detail ?? 'gebalanceerd'}, lengte ${payload.settings.answerLength ?? 'normaal'}, gedrag ${payload.settings.behavior ?? 'encouraging maar streng'}.

REGELS:
1. Leerstof in fragmenten is de primaire bron; verwijs met [Bron: fragment]. Verzin nooit cursusinhoud.
2. Antwoord in de taal van de gebruiker (meestal Nederlands, markdown).
3. Misverstanden: geef een diagnose, niet dezelfde uitleg opnieuw; bied een gerichte mini-oefening.
4. Geef nooit garanties over echte examens; prognoses zijn voorzichtige indicaties.
5. De gebruiker behoudt altijd de controle over zijn planning en gegevens.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: sys },
    ...payload.history.slice(-12),
    { role: 'user', content: payload.message }
  ];
  const { content } = await callAi({ userId, task: 'coach_chat', userPreference, messages, temperature: 0.5, maxTokens: 3000 });
  return { reply: content };
}

// ---------- Flashcards + begrippen ----------

export async function generateFlashcards(userId: string, payload: {
  text: string;
  count: number;
  subject: string;
  objectiveMap: { id: string; title: string }[];
  language: string;
}, userPreference?: string): Promise<{ front: string; back: string; hint?: string; objectiveId?: string }[]> {
  const { content } = await callAi({
    userId,
    task: 'summarization',
    userPreference,
    messages: [
      { role: 'system', content: `Je genereert flashcards voor studie. Geef uitsluitend JSON: {"cards": [{"front": string, "back": string, "hint": string?, "objectiveId": string?}]}. Eén concept per kaart, in vraagstijl, geen ja/nee-antwoorden, taal: ${payload.language}. Gebruik objectiveId alleen uit de gegeven lijst.` },
      { role: 'user', content: `Vak: ${payload.subject}\nLeerdoelen: ${payload.objectiveMap.map((o) => `${o.id}=${o.title}`).join('; ')}\nAantal: ${payload.count}\n\nStof:\n${payload.text.slice(0, 50000)}` }
    ],
    responseFormat: 'json',
    maxTokens: 4000
  });
  const parsed = parseJsonLoose<{ cards: { front: string; back: string; hint?: string; objectiveId?: string }[] }>(content);
  return parsed.cards;
}

export async function dictionaryLookup(userId: string, term: string, language: string, simpleMode: boolean, userPreference?: string): Promise<{ term: string; definition: string; simple: string; example: string; field: string }> {
  const { content } = await callAi({
    userId,
    task: 'summarization',
    userPreference,
    messages: [
      { role: 'system', content: `Je bent een woordenboek voor studenten. Geef uitsluitend JSON: {"term": string, "definition": string (kort en accuraat), "simple": string (zelfde in eenvoudige taal), "example": string, "field": string (vakgebied)}. Taal: ${language}. ${simpleMode ? 'Begin met de eenvoudige uitleg.' : ''}` },
      { role: 'user', content: `Zoek op: ${term}` }
    ],
    responseFormat: 'json',
    maxTokens: 800
  });
  return parseJsonLoose(content);
}

// ---------- Advies / rapport / prognose ----------

export interface AdvicePayload {
  userName: string;
  subjects: { name: string; avgMastery: number; weakObjective?: string | null }[];
  recentAttempts: { percent: number; at: string; mode: string }[];
  dueCards: number;
  upcomingEvents: { title: string; date: string; kind: string }[];
  dailyGoalMinutes: number;
  todayMinutes: number;
  recurringErrors: string[];
}

export async function dailyRecommendations(userId: string, payload: AdvicePayload, userPreference?: string): Promise<{ items: { title: string; body: string; action: string; urgency: 'info' | 'attention' | 'critical' }[] }> {
  const { content } = await callAi({
    userId,
    task: 'forecast',
    userPreference,
    messages: [
      { role: 'system', content: 'Je maakt dagelijkse studieaanbevelingen. Geef uitsluitend JSON: {"items": [{"title": string, "body": string (1-2 zinnen), "action": string (concrete actie in de app, bv "Start een quiz over X"), "urgency": "info"|"attention"|"critical"}]}. Max 5 items. Taal: nl.' },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    responseFormat: 'json',
    maxTokens: 1600
  });
  return parseJsonLoose(content);
}

export async function examForecast(userId: string, payload: {
  examTitle: string;
  daysLeft: number;
  subjects: { name: string; avgMastery: number; objectives: { title: string; score: number }[] }[];
  recentAttempts: { percent: number; at: string }[];
}, userPreference?: string): Promise<{ prognose: string; perSubject: { name: string; expected: string; note: string }[]; keyTopics: string[]; disclaimer: string }> {
  const { content } = await callAi({
    userId,
    task: 'forecast',
    userPreference,
    messages: [
      { role: 'system', content: 'Je maakt een voorzichtige examenprognose op basis van uitsluitend beschikbare resultaten; waar data onvoldoende is, zeg je dat eerlijk. Geef uitsluitend JSON: {"prognose": string, "perSubject": [{"name": string, "expected": string (bijv "62-74%"), "note": string}], "keyTopics": [string], "disclaimer": string}. Taal: nl. In "disclaimer" staat expliciet dat dit een indicatie is en geen garantie.' },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    responseFormat: 'json',
    maxTokens: 2000
  });
  return parseJsonLoose(content);
}
