import { describe, expect, it } from 'vitest';
import { nextSrs } from '../src/lib/srs';

describe('nextSrs (SM-2)', () => {
  it('start met interval 1 dag na eerste correcte antwoord', () => {
    const n = nextSrs({ ease: 2.5, interval_days: 0, reps: 0, lapses: 0 }, 4);
    expect(n.reps).toBe(1);
    expect(n.interval_days).toBe(1);
  });

  it('gebruikt interval 6 na tweede correcte antwoord', () => {
    const n = nextSrs({ ease: 2.5, interval_days: 1, reps: 1, lapses: 0 }, 4);
    expect(n.reps).toBe(2);
    expect(n.interval_days).toBe(6);
  });

  it('vermenigvuldigt interval met ease vanaf de derde herhaling', () => {
    const n = nextSrs({ ease: 2.5, interval_days: 6, reps: 2, lapses: 0 }, 4);
    expect(n.reps).toBe(3);
    expect(n.interval_days).toBeCloseTo(15, 0);
  });

  it('reset bij een fout antwoord en verlaagt ease niet onder 1.3', () => {
    let st = { ease: 1.3, interval_days: 15, reps: 4, lapses: 0 };
    st = { ...st, ...nextSrs(st, 0) };
    expect(st.reps).toBe(0);
    expect(st.interval_days).toBe(0);
    expect(st.lapses).toBe(1);
    expect(st.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('grade 5 verhoogt ease met +0.05 en grade 3 verlaagt met 0.05', () => {
    const up = nextSrs({ ease: 2.5, interval_days: 6, reps: 2, lapses: 0 }, 5);
    const down = nextSrs({ ease: 2.5, interval_days: 6, reps: 2, lapses: 0 }, 3);
    expect(up.ease).toBeCloseTo(2.55, 2);
    expect(down.ease).toBeCloseTo(2.45, 2);
  });

  it('plantt due in de toekomst binnen interval-dagen', () => {
    const n = nextSrs({ ease: 2.5, interval_days: 6, reps: 2, lapses: 0 }, 4);
    expect(new Date(n.due_at.replace(' ', 'T') + 'Z').getTime()).toBeGreaterThan(Date.now() + 6 * 86400000 - 60000);
  });
});
