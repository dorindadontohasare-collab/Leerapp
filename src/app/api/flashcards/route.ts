import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  objectiveId: z.string().nullable().optional(),
  front: z.string().min(1),
  back: z.string().min(1),
  hint: z.string().nullable().optional(),
  tags: z.array(z.string()).default([])
});

export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const subjectId = new URL(req.url).searchParams.get('subjectId');
    const rows = db.prepare(
      `SELECT f.*, s.name subjectName, c.title chapterTitle, o.title objectiveTitle,
         cs.due_at, cs.reps, cs.ease, cs.interval_days, cs.lapses
       FROM flashcards f
       LEFT JOIN subjects s ON s.id = f.subject_id
       LEFT JOIN chapters c ON c.id = f.chapter_id
       LEFT JOIN objectives o ON o.id = f.objective_id
       LEFT JOIN card_state cs ON cs.user_id = f.user_id AND cs.card_id = f.id
       WHERE f.user_id = ? ${subjectId ? 'AND f.subject_id = ?' : ''}
       ORDER BY f.created_at DESC`
    ).all(...(subjectId ? [u.id, subjectId] : [u.id])) as { id: string; [k: string]: unknown }[];
    return ok({ cards: rows.map((r) => ({ ...r, tags: JSON.parse(String(r.tags ?? '[]')) })) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const fid = id('f_');
    db.prepare('INSERT INTO flashcards (id, user_id, subject_id, chapter_id, objective_id, front, back, hint, tags, origin) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      fid, u.id, body.subjectId ?? null, body.chapterId ?? null, body.objectiveId ?? null, body.front, body.back, body.hint ?? null,
      JSON.stringify(body.tags), 'manual'
    );
    return ok({ id: fid }, 201);
  });
}
