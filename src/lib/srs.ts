/**
 * Spaced repetition (SM-2 variant).
 * grades: 0 = fout, 1-2 = moeilijk/juist, 3-5 = juist.
 */
export interface CardSrsState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

export function nextSrs(state: CardSrsState, grade: number): Required<CardSrsState> & { due_at: string } {
  let { ease, interval_days, reps, lapses } = state;
  if (grade < 3) {
    reps = 0;
    lapses += 1;
    interval_days = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    ease = Math.max(1.3, Math.min(2.8, ease + (grade === 3 ? -0.05 : 0.05)));
    if (reps === 1) interval_days = 1;
    else if (reps === 2) interval_days = 6;
    else interval_days = Math.round(interval_days * ease * 10) / 10;
  }
  const due = new Date(Date.now() + (interval_days === 0 ? 10 * 60 * 1000 : interval_days * 86400000));
  return { ease, interval_days, reps, lapses, due_at: due.toISOString().replace('T', ' ').slice(0, 19) };
}
