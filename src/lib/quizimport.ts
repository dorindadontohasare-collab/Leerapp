export interface ParsedQuestion {
  type: string;
  prompt: string;
  options: { id: string; text: string; correct?: boolean }[];
  answer: Record<string, unknown>;
  hint: string | null;
  explanation: string | null;
  points: number;
  difficulty: number;
  objectiveIds: string[];
  confidence: 'unknown' | 'parsed' | 'ai_interpretation';
  note?: string;
}

export interface ParsedQuestion {
  type: string;
  prompt: string;
  options: { id: string; text: string; correct?: boolean }[];
  answer: Record<string, unknown>;
  hint: string | null;
  explanation: string | null;
  points: number;
  difficulty: number;
  objectiveIds: string[];
  confidence: 'unknown' | 'parsed' | 'ai_interpretation';
  note?: string;
}

export function parseTextQuiz(raw: string): ParsedQuestion[] {
  const lines: string[] = raw.replace(/\r\n/g, '\n').split('\n');
  const answerKey = new Map<number, string>();
  const questions: ParsedQuestion[] = [];

  const keySectionRe = /^(antwoorden?|answers?|sleutel|answer key)\s*:?\s*(.*)$/i;
  let inKeySection = false;
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const sectionMatch = l.match(keySectionRe);
    if (sectionMatch) {
      /* Kopregel zoals "Antwoorden:" (zonder getallen op dezelfde regel) opent óók de sleutelsectie. */
      inKeySection = true;
    }
    if (inKeySection) {
      const remaining = sectionMatch ? sectionMatch[2] : l;
      const entryRe = /(\d{1,3})\s*[).:]\s*([A-Ha-h])\b/g;
      let m: RegExpExecArray | null;
      let matched = false;
      while ((m = entryRe.exec(remaining))) {
        answerKey.set(Number(m[1]), m[2].toUpperCase());
        matched = true;
      }
      if (!matched && l.length > 0 && sectionMatch && !/\d/.test(sectionMatch[2])) continue;
    }
  }

  const qStartRe = /^(?:vraag\s*)?(?:q\s*)?(\d{1,3})\s*[).:]\s+(.+)$/i;
  const optRe = /^\(?([a-hA-H][1]?)\)\s+(.+)$/;
  type Pending = { prompt: string; options: { id: string; text: string; letter?: string }[]; idx: number };
  let current: Pending | null = null;
  const flush = () => {
    if (!current) return;
    const options = current.options.map((o, i) => ({ id: 'o' + (i + 1), text: o.text, letter: (o.letter ?? String.fromCharCode(97 + i)).toUpperCase() }));
    const keyLetter = answerKey.get(current.idx);
    let answer: Record<string, unknown> = {};
    let confidence: ParsedQuestion['confidence'] = 'unknown';
    let note: string | undefined;
    let type = 'open';
    const isTF = options.length === 2 && /juist.*fout|waar.*niet waar|true.*false/i.test(options.map((o) => o.text).join(' ') + current.prompt);
    if (options.length >= 2) {
      type = isTF ? 'true_false' : 'mc_single';
      const correctOpt = options.find((o) => keyLetter && (o.letter === keyLetter || o.text.trim().toUpperCase().startsWith(keyLetter)));
      if (correctOpt) {
        answer = { correct: correctOpt.id };
        confidence = 'parsed';
      } else {
        answer = {};
        note = 'Geen antwoordsleutel gevonden voor deze vraag: markeer zelf het juiste antwoord.';
      }
    } else if (isTF) {
      type = 'true_false';
      answer = { correct: /juist|waar|true/i.test(current.prompt) ? true : false };
      note = 'Antwoord afgeleid uit de vraagstelling; controleer het.';
      confidence = 'ai_interpretation';
    } else {
      note = 'Antwoordmodel ontbreekt: vul het antwoord in of koppel leerstof om te controleren.';
    }
    if (current.prompt.length < 8) { current = null; return; }
    questions.push({
      type,
      prompt: current.prompt,
      options,
      answer,
      hint: null,
      explanation: null,
      points: 1,
      difficulty: 2,
      objectiveIds: [],
      confidence,
      note
    });
    current = null;
  };

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (keySectionRe.test(l) && answerKey.size > 0) { flush(); inKeySection = true; break; }
    inKeySection = false;
    const qm = l.match(qStartRe);
    if (qm) {
      flush();
      current = { prompt: qm[2].trim(), options: [], idx: Number(qm[1]) };
      continue;
    }
    if (current) {
      const om = l.match(optRe);
      if (om) {
        current.options.push({ id: om[1], text: om[2].trim(), letter: om[1].toUpperCase() });
      } else if (current.options.length === 0) {
        current.prompt += ' ' + l;
      } else {
        current.options[current.options.length - 1].text += ' ' + l;
      }
    }
  }
  flush();
  return questions;
}

export function parseJsonQuiz(raw: string): ParsedQuestion[] | { error: string } {
  try {
    const data = JSON.parse(raw) as unknown;
    const list = Array.isArray(data) ? data : (data as { questions?: unknown[] }).questions;
    if (!Array.isArray(list)) return { error: 'JSON moet een lijst vragen of {"questions":[...]} zijn.' };
    return list.map((item): ParsedQuestion => {
      const q = item as Record<string, unknown>;
      const options = Array.isArray(q.options)
        ? (q.options as { id?: string; text?: string; correct?: boolean }[]).map((o, i) => ({ id: o.id ?? 'o' + (i + 1), text: String(o.text ?? ''), correct: o.correct }))
        : [];
      const rawType = String(q.type ?? q.format ?? '').toLowerCase();
      const type = options.length >= 2 ? 'mc_single'
        : rawType.includes('open') ? 'open'
        : rawType.includes('fill') ? 'fill'
        : rawType.includes('numer') ? 'numeric'
        : 'open';
      const prompt = String(q.prompt ?? q.question ?? q.vraag ?? '');
      let answer: Record<string, unknown> = {};
      if (options.length && typeof q.answer === 'string' || typeof q.correct === 'string') {
        const key = String(q.answer ?? q.correct);
        const opt = options.find((o) => o.text === key) ?? options[options.length - 1];
        const byIdx = options.find((o) => o.id === key) ?? options[options.findIndex((o) => o.text.toUpperCase().startsWith(key))];
        answer = { correct: (byIdx ?? opt).id };
      } else if (typeof q.answer === 'object' && q.answer !== null) answer = q.answer as Record<string, unknown>;
      else if (q.answer != null) answer = { accepted: [String(q.answer)], modelAnswer: String(q.answer) };
      else if (q.solution != null) answer = { modelAnswer: String(q.solution) };
      return {
        type,
        prompt,
        options,
        answer,
        hint: null,
        explanation: String(q.explanation ?? q.uitleg ?? '') || null,
        points: Number(q.points ?? q.punten ?? 1),
        difficulty: Number(q.difficulty ?? 2),
        objectiveIds: [],
        confidence: (typeof q.answer !== 'undefined' || options.some((o) => o.correct)) ? 'parsed' : 'unknown' as const,
        note: answer && Object.keys(answer).length === 0 ? 'Geen antwoord gevonden in de JSON: vul aan.' : undefined
      };
    }).filter((q) => q.prompt.length > 0);
  } catch { return { error: 'Ongeldige JSON.' }; }
}

