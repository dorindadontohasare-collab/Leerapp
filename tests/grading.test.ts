import { describe, expect, it } from 'vitest';
import { gradeObjective } from '../src/lib/grading';

const q = (type: string, answer: Record<string, unknown>, points = 2, options: { id: string; text: string }[] = []) => ({
  type,
  prompt: 'testvraag',
  options,
  answer,
  points,
  explanation: 'uitleg'
});

describe('gradeObjective (exacte beoordeling per type)', () => {
  it('mc_single: correcte optie is juist, andere niet', () => {
    const question = q('mc_single', { correct: 'o2' }, 2, [
      { id: 'o1', text: 'fout' },
      { id: 'o2', text: 'goed' }
    ]);
    expect(gradeObjective(question, { choice: 'o2' }).correct).toBe(true);
    expect(gradeObjective(question, { choice: 'o1' }).correct).toBe(false);
  });

  it('mc_multi: alle juiste opties vereist', () => {
    const question = q('mc_multi', { correct: ['o1', 'o3'] }, 2, [
      { id: 'o1', text: 'a' },
      { id: 'o2', text: 'b' },
      { id: 'o3', text: 'c' }
    ]);
    expect(gradeObjective(question, { choices: ['o1', 'o3'] }).correct).toBe(true);
    expect(gradeObjective(question, { choices: ['o1'] }).correct).toBe(false);
    expect(gradeObjective(question, { choices: ['o1', 'o2', 'o3'] }).correct).toBe(false);
  });

  it('fill: accepteert synoniemen uit de acceptatielijst', () => {
    const question = q('fill', { accepted: ['prijselasticiteit', 'elasticiteit'] });
    expect(gradeObjective(question, { text: 'Prijselasticiteit' }).correct).toBe(true);
    expect(gradeObjective(question, { text: 'vraagkromme' }).correct).toBe(false);
  });

  it('numeric: houdt rekening met tolerantie en eenheid-loos antwoord', () => {
    const question = q('numeric', { value: 3.14, tolerance: 0.01 });
    expect(gradeObjective(question, { value: 3.145 }).correct).toBe(true);
    expect(gradeObjective(question, { value: 3.5 }).correct).toBe(false);
  });

  it('match: controlleert alle paren in beide richtingen', () => {
    const question = q('match', { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }] });
    expect(gradeObjective(question, { pairs: [{ left: 'A', right: '1' }, { left: 'B', right: '2' }] }).correct).toBe(true);
    expect(gradeObjective(question, { pairs: [{ left: 'A', right: '2' }, { left: 'B', right: '1' }] }).correct).toBe(false);
  });

  it('sort: exacte volgorde verplicht', () => {
    const question = q('sort', { items: [{ id: 'i1', text: 'x', position: 0 }, { id: 'i2', text: 'y', position: 1 }] });
    expect(gradeObjective(question, { order: ['i1', 'i2'] }).correct).toBe(true);
    expect(gradeObjective(question, { order: ['i2', 'i1'] }).correct).toBe(false);
  });

  it('true_false', () => {
    const question = q('true_false', { correct: true }, 1, [{ id: 'o1', text: 'Juist' }, { id: 'o2', text: 'Fout' }]);
    expect(gradeObjective(question, { choice: 'o1' }).correct).toBe(true);
    expect(gradeObjective(question, { choice: 'o2' }).correct).toBe(false);
  });

  it('drag: koppelt items juist aan categorieën', () => {
    const question = q('drag', { categories: ['fruit', 'groente'], items: [{ id: 'it1', text: 'appel', category: 'fruit' }] });
    expect(gradeObjective(question, { assignment: { it1: 'fruit' } }).correct).toBe(true);
    expect(gradeObjective(question, { assignment: { it1: 'groente' } }).correct).toBe(false);
  });

  it('puntenverdeling: max = punten van de vraag', () => {
    const question = q('mc_single', { correct: 'o1' }, 3, [{ id: 'o1', text: 'x' }, { id: 'o2', text: 'y' }]);
    const g = gradeObjective(question, { choice: 'o1' });
    expect(g.maxPoints).toBe(3);
    expect(g.points).toBe(3);
  });
});
