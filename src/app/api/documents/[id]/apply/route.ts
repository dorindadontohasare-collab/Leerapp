import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { id } from '@/lib/auth';
import { recordMasteryEvent } from '@/lib/mastery';

const schema = z.object({
  subjectId: z.string().min(1),
  chapters: z.array(z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    summary: z.string().optional(),
    position: z.number().int().default(0),
    objectives: z.array(z.object({ title: z.string(), description: z.string().optional() })).default([])
  })),
  flashcards: z.array(z.object({ front: z.string(), back: z.string(), hint: z.string().optional() })).default([]),
  conceptsObjectiveChapter: z.string().optional(),
  kindSegments: z.boolean().optional()
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id: did } = await ctx.params;
    const body = schema.parse(await req.json());
    const db = getDb();
    const created: { chapters: string[]; objectives: string[]; flashcards: string[] } = { chapters: [], objectives: [], flashcards: [] };
    for (const ch of body.chapters) {
      let cid = ch.id || null;
      if (!cid) {
        cid = id('c_');
        db.prepare('INSERT INTO chapters (id, user_id, subject_id, title, summary, position) VALUES (?,?,?,?,?,?)').run(
          cid, u.id, body.subjectId, ch.title, ch.summary ?? null, ch.position
        );
      }
      created.chapters.push(cid);
      for (const [i, o] of ch.objectives.entries()) {
        const oid = id('o_');
        db.prepare('INSERT INTO objectives (id, user_id, subject_id, chapter_id, title, description, position) VALUES (?,?,?,?,?,?,?)').run(
          oid, u.id, body.subjectId, cid, o.title, o.description ?? null, i
        );
        created.objectives.push(oid);
      }
    }
    for (const card of body.flashcards.slice(0, 300)) {
      const fcid = id('f_');
      const cid = created.chapters[0] ?? null;
      db.prepare('INSERT INTO flashcards (id, user_id, subject_id, chapter_id, front, back, hint, origin) VALUES (?,?,?,?,?,?,?,?)').run(
        fcid, u.id, body.subjectId, cid, card.front, card.back, card.hint ?? null, 'ai'
      );
      created.flashcards.push(fcid);
    }
    db.prepare('UPDATE documents SET subject_id = ? WHERE id = ? AND user_id = ?').run(body.subjectId, did, u.id);
    return ok({ created });
  });
}
