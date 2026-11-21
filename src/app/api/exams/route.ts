import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';

const create = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().nullable().optional(),
  examDate: z.string(),
  examLevel: z.string().max(40).optional(),
  notes: z.string().max(2000).optional()
});

export async function GET() {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const db = getDb();
    const rows = db.prepare(
      `SELECT e.*, s.name subjectName,
        (SELECT COUNT(*) FROM objectives o WHERE o.subject_id = e.subject_id) objectiveCount,
        (SELECT COUNT(*) FROM objectives o WHERE o.subject_id = e.subject_id AND o.status = 'mastered') masteredCount
       FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id WHERE e.user_id = ? ORDER BY e.exam_date ASC`
    ).all(u.id);
    return ok({ exams: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const body = create.parse(await req.json());
    const db = getDb();
    const eid = id('e_');
    db.prepare('INSERT INTO exams (id, user_id, subject_id, title, exam_date, exam_level, notes) VALUES (?,?,?,?,?,?,?)').run(
      eid, u.id, body.subjectId ?? null, body.title, body.examDate, body.examLevel ?? null, body.notes ?? null
    );
    return ok({ id: eid }, 201);
  });
}
