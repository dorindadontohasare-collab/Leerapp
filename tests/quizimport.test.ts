import { describe, expect, it } from 'vitest';
import { parseTextQuiz, parseJsonQuiz } from '../src/lib/quizimport';

const FIXTURE = `Vraag 1: Wat is de hoofdstad van Limburg?
a) Eindhoven
b) Maastricht
c) Venlo

Vraag 2: Noem twee begrippen uit de BTW-administratie.

Vraag 3: Juist of fout: btw moet per kwartaal worden aangegeven?
a) Juist
b) Fout

Antwoorden:
1) b
3) a
`;

describe('parseTextQuiz (Nederlands antwoordsleutel-formaat)', () => {
  const parsed = parseTextQuiz(FIXTURE);

  it('herkent drie vragen', () => {
    expect(parsed).toHaveLength(3);
  });

  it('leest de antwoordsleutel en zet confidence op parsed', () => {
    const q1 = parsed[0];
    expect(q1.type).toBe('mc_single');
    expect(q1.options).toHaveLength(3);
    expect((q1.answer as { correct?: string }).correct).toBe(q1.options.find((o) => o.text === 'Maastricht')?.id);
    expect(q1.confidence).toBe('parsed');
  });

  it('markeert vragen zonder sleutel-antwoord als unknown met controle-notitie', () => {
    const q2 = parsed[1];
    expect(q2.type).toBe('open');
    expect(q2.confidence).toBe('unknown');
    expect(q2.note).toMatch(/antwoordmodel|antwoord/i);
  });

  it('herkent juist/fout opties als true_false', () => {
    const q3 = parsed[2];
    expect(q3.type).toBe('true_false');
    expect(q3.confidence).toBe('parsed');
  });

  it('presenteert AI-interpretatie nooit als officieel antwoordmodel', () => {
    for (const q of parsed) {
      if (q.confidence === 'ai_interpretation' || q.confidence === 'unknown') {
        expect(q.note).toBeTruthy();
      }
    }
  });
});

describe('parseJsonQuiz', () => {
  it('accepteert {"questions":[...]} met tekstantwoord', () => {
    const out = parseJsonQuiz(JSON.stringify({
      questions: [
        { prompt: 'Wat is btw?', type: 'open', answer: 'belasting over toegevoegde waarde', punten: 3 }
      ]
    }));
    expect('error' in out).toBe(false);
    const list = out as { answer: Record<string, unknown>; confidence: string }[];
    expect(list[0].answer.modelAnswer ?? (list[0].answer as { accepted?: string[] }).accepted?.[0]).toBeTruthy();
    expect(list[0].confidence).toBe('parsed');
  });

  it('geeft nette fout bij ongeldige JSON', () => {
    expect(parseJsonQuiz('nope')).toEqual({ error: 'Ongeldige JSON.' });
  });
});
