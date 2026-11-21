# StudyBase — AI-study workspace

StudyBase is een volledig functionele, AI-aangedreven study workspace om je **volledige leerstof te beheersen** — geen quizsite, geen statisch dashboard. Documentanalyse, een geavanceerde quiz engine, flashcards met spaced repetition, een AI-studiecoach, foutbibliotheek, planner en statistieken zijn onderdeel van **één samenhangend leerproces**.

## 🎯 Direct openen in je browser — niets installeren

Requires alleen een GitHub-account (Codespaces is gratis, 2-core maandenlimiet ruim voldoende):

1. Klik op deze repo-pagina op de groene **`< > Code`**-knop.
2. Open het tabblad **Codespaces** en klik op **Create codespace on main**.
3. Wacht tot de omgeving klaar is (afhankelijkheden worden automatisch geïnstalleerd).
4. Typ in het terminalpaneel onderin:
   ```bash
   npm run dev
   ```
5. Na enkele seconden opent de app automatisch in je browser (of klik op de pop-up **Open in browser** op poort 3000).
6. Maak een account aan op `/register` en je kunt volledig met de app werken. Stoppen en later verdergaan: de codespace bewaart je database; herstart met `npm run dev`.

> Optionele AI-functionaliteit: maak in de codespace het bestand `.env` aan (of kopieer `.env.example`) en vul `MISTRAL_API_KEY` in; herstart daarna `npm run dev`.

## 📦 Downloaden en lokaal draaien

Download de nieuwste broncode-zip van de branch [`download/studybase`](https://github.com/dorindadontohasare-collab/Leerapp/raw/download/studybase/studybase.zip) (of via de groene **Code**-knop → **Download ZIP**), en lokaal met Node.js 20+:

```bash
npm install
cp .env.example .env      # vul MISTRAL_API_KEY in voor AI-functies
npm run dev               # http://localhost:3000
```

```bash
npm install
cp .env.example .env      # vul MISTRAL_API_KEY in voor AI-functies
npm run dev               # http://localhost:3000
```

```bash
npm run build && npm start   # productie build
npm test                     # unit tests (mastery, SRS, grading, quiz-import)
npm run db:reset             # lokale database wissen (ALLE gegevens gaan weg)
```

Maak een account aan op `/register` — dat is de enige configuratie die nodig is om te starten.

## AI-configuratie (server-side, nooit in de frontend)

Alle AI-aanroepen lopen via de backend (`MISTRAL_API_KEY` in server-omgevingsvariabelen). De frontend bevat géén sleutels.

```bash
# .env
MISTRAL_API_KEY=sk-...
# optioneel
MISTRAL_BASE_URL=https://api.mistral.ai/v1   # compatibele OpenAI-stijl endpoint werkt ook
```

**Eerlijkheidsbeleid:** zonder API-sleutel doen AI-functies *niet* alsof ze werken. Ze retourneren `503 { configured: false }` en de interface toont een correcte status met uitleg over wat je moet configureren. Interactieve quizmaker, proefexamens, samenvattingen, OCR-analyse, woordenboek, coach-chat en vergelijkbare oefenvragen zijn AI-afhankelijk; documentopslag, import-tekstverwerking (incl. antwoordsleuteldetectie), quizmaken, flashcards, planner, statistieken, apps en back-ups werken volledig zonder sleutel.

## Wat zit erin

| Modus | Wat je kunt |
| --- | --- |
| **Dashboard** | Begroeting, dagdoel-voortgang, AI-aanbevelingen met concrete acties, voortgang per vak |
| **Mijn leeromgeving** | Vak → hoofdstuk → leerdoel, 6 beheersingsstatussen, notities |
| **Documenten** | PDF, DOC(X), PPT(X), TXT, MD, CSV, afbeeldingen (OCR), tekst, URL's; 15-staps analyse, volledigheidscontrole, 12 samenvattingstypen in 3 niveaus |
| **Quiz engine** | 15 vraagtypes, 6 modi (oefen/examen/snelheid/overleving/zwakke-punten/beheersing), per-vraag opslaan, hervatten, AI-open correctie, rapport per hoofdstuk/leerdoel |
| **Quiz importeren** | Tekst, JSON, bestanden; antwoordsleuteldetectie; onzekere antwoorden expliciet gemarkeerd (nóóit als officieel model gepresenteerd) |
| **Mijn apps** | HTML / ZIP / JSON / https-URL leerapps, sandboxed iframe, integratieprotocol, handmatige resultateninvoer |
| **AI-coach** | Chat met studiecontext, bronverwijzingen, dagelijkse aanbevelingen, voorzichtige examenprognose (nooit een garantie) |
| **Flashcards** | SM-2 spaced repetition, AI- of handmatige kaarten, 0–5 beoordelingswaardering |
| **Foutbibliotheek** | Alle fouten met uitleg, patroondetectie, AI-oefenronde, opslaan als flashcard |
| **Planner & kalender** | Taken, AI-planning (werkt ook zonder sleutel), dag/week/maand, verslepen |
| **Examenvoorbereiding** | Aftelklok, AI-proefexamens met tijdslimiet, prognose met disclaimer |
| **Statistieken** | Grafieken, filters op dag/week/maand/vak/hoofdstuk/leerdoel |
| **Studietools** | Rekenmachine, AI-woordenboek, formulebibliotheek, Pomodoro (XP), mondeling overhoren (Web Speech; werkt ook zonder microfoon) |
| **Gamification** | XP, levels, streaks, badges — beloont beheersing en herhaling, niet quizvolume |
| **Export & back-up** | JSON/CSV-export (per categorie of alles), back-up downloaden + herstellen, PWA-installatie |

## Beheersingsengine (hoe scores tot stand komen)

Beheersing per leerdoel komt van `mastery_events` (quiz, app, flashcard, mondeling, examen). De score combineert correctheid gewogen naar vraagtype (herkennen < toepassen), moeilijkheid, zelfstandigheid, bron en recentheid (halveringsleeftijd 21 dagen), met een **bewijsfactor**: met te weinig gebeurtenissen of vraagtypes blijft de score bewust laag. Status `beheerst` vereist ≥85% score, ≥3 verschillende vraagtypen én ≥6 bewijsmomenten. Op de leerdoelpagina's staat de transparante berekening (score, status, bewijs, redeneren).

## StudyBase Integratie-API v1.0 (voor je eigen leerapps)

Geïmporteerde apps draaien in een `sandbox="allow-scripts allow-forms allow-popups"` iframe **zonder toegang** tot je accountgegevens. Apps die willen integreren, sturen via `postMessage`:

```js
// 1. Handshake: app quetst, de ouder antwoordt met appId
window.parent.postMessage({ protocol: 'studybase-integration/1.0', type: 'ready' }, '*');
window.addEventListener('message', (e) => {
  if (e.data?.protocol === 'studybase-integration/1.0' && e.data.type === 'handshake') {
    window.__studybase_appId = e.data.appId;
  }
});

// 2. Resultaten melden (alleen velden die de app echt kent):
window.parent.postMessage({
  protocol: 'studybase-integration/1.0',
  type: 'result',
  appId: window.__studybase_appId,
  attemptId: 'my-run-42',            // optioneel
  subjectId: null,                    // optioneel (of gekoppeld bij import)
  chapterId: null, objectiveIds: [],  // optioneel
  questionId: 'my-q1',
  answer: 'Maastricht',
  isCorrect: true,
  score: 1,                            // behaalde punten (optioneel)
  completedAt: new Date().toISOString()
}, '*');

// 3. Eindrapport (optioneel)
window.parent.postMessage({
  protocol: 'studybase-integration/1.0',
  type: 'summary',
  appId: window.__studybase_appId,
  score: 8, maxScore: 10, completedAt: new Date().toISOString()
}, '*');
```

Essayeer wat StudyBase controleert bij ontvangst (`validateAppMessage`): protocol, berichttype, `isCorrect`/`score`/`answer`/`completedAt` moeten geldig zijn; onbekende velden worden genegeerd. Resultaten → mastery_events (bron `app`) en XP-award.

**Voor apps zonder integratie** kun je resultaten handmatig invoeren (ook belangrijk: zinvol gebruik zonder protocol). StudyBase onderscheidt dat expliciet in de UI: *alleen geopend*, *inhoud geïmporteerd*, *volledig geïntegreerd*.

## Architectuur

- **Frontend**: Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3.4 met CSS-variabelen-thema's (light/dark/system, `data-theme`-attribuut, persisted in localStorage `sb_theme`).
- **Backend**: Next.js API routes; alle AI-aanroepen server-side (`src/lib/ai`), throttle per gebruiker, geen frontend-sleutels.
- **Database**: SQLite (better-sqlite3, WAL, FK's AAN) in `data/app.db`; 27 tabellen met `User → Subjects → Chapters → Objectives → Documents → Quizzes → Questions → Attempts/Answers → Results → Mastery` plus flashcards, fouten, plan taken, kalender, examens, apps, AI-geheugen.
- **Bestandsopslag**: server-side in `data/uploads/`, gediend via finale, geauthenticeerde `documents/[id]/file` (geen openbare schrijfruimte).
- **Geïmporteerde apps**: sandboxed iframe + `validateAppMessage`-protocol; geen zelfde-oorsprong, geen cookies of accountgegevens.
- **PWA**: `manifest.webmanifest` + service worker (netwerk-vólóórt, fallback-cache) voor installatie en beperkt offline studeren (flashcards, geopende apps).

## Gegevensmodel

```
users 1─N subjects 1─N chapters 1─N objectives
        │			     └─N mastery_events (bewijs)
        ├─N documents (met analyse + herkomst)
        ├─N quizzes 1─N questions 1─N answers   ┐
        ├─N attempts (resultaten, hervatbaar)────┴─ scores → mastery
        ├─N flashcards ── card_state (SM-2)
        ├─N mistakes ── mistakes_patterns (patroondetectie)
        ├─N plan_tasks / calendar_events / exams / apps
        └─N events (studietijd, XP) → stats
```

## Eerlijke status van integraties

| Integratie | Status zonder configuratie |
| --- | --- |
| Mistral AI (quizgen, samenvattingen, coach, correctie, OCR) | `503 {configured:false}` + uitleg in UI |
| Google/Apple login (OAuth) | Toont "niet ingesteld" — geen vervalslogin; e-mail+wachtwoord werkt volledig |
| Spraakherkenning | Werkt in ondersteunende browsers; anders typen (duidelijk gemeld) |

## Tests

```bash
npm test
```

Dekt: SM-2-intervallen, beheersingslogica (één juist MC-antwoord ≠ beheerst; recency; transparantie), exacte beoordeling per vraagtype en Nederlandse quiz-import incl. antwoordsleutels en onzekerheidsmarkeringen.
