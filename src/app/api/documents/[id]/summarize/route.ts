import { z } from 'zod';
import { requireUser, isUser, ok, handle } from '@/lib/api';
import { getDb } from '@/lib/db';
import { generateSummary, SummaryKind } from '@/lib/ai/tasks';
import { id as genId } from '@/lib/auth';

export const maxDuration = 300;

const schema = z.object({
  kind: z.enum(['brief', 'detailed', 'per_chapter', 'concepts', 'examples', 'formulas', 'diagram', 'steps', 'exercises', 'compare', 'mindmap']),
  detail: z.enum(['kort', 'normaal', 'uitgebreid']).default('normaal'),
  save: z.boolean().default(true),
  subjectId: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional()
});

const KIND_TITLES: Record<SummaryKind, string> = {
  brief: 'Beknopte samenvatting', detailed: 'Uitgebreide samenvatting', per_chapter: 'Samenvatting per hoofdstuk',
  concepts: 'Begrippenlijst', examples: 'Voorbeelden', formulas: 'Formules', diagram: 'Schema', mindmap: 'Mindmap',
  steps: 'Stappenplan', exercises: 'Oefeningen', compare: 'Vergelijking'
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const u = await requireUser();
    if (!isUser(u)) return u;
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const db = getDb();
    const doc = db.prepare('SELECT title, text FROM documents WHERE id = ? AND user_id = ?').get(id, u.id) as
      | { title: string; text: string } | undefined;
    if (!doc) return ok({ error: 'Niet gevonden' }, 404);
    const settings = (db.prepare('SELECT settings FROM users WHERE id = ?').get(u.id) as { settings: string }).settings;
    const parsed = JSON.parse(settings) as { aiModel?: string; language?: string };
    const { markdown, sourceRefs } = await generateSummary(u.id, {
      title: doc.title, text: doc.text, kind: body.kind, detail: body.detail, language: parsed.language || 'nl'
    }, parsed.aiModel);
    let summaryId: string | null = null;
    if (body.save) {
      summaryId = genId('sum_');
      db.prepare('INSERT INTO summaries (id, user_id, document_id, subject_id, chapter_id, kind, title, content, source_refs) VALUES (?,?,?,?,?,?,?,?,?)').run(
        summaryId, u.id, id, body.subjectId ?? null, body.chapterId ?? null, body.kind, KIND_TITLES[body.kind], markdown, JSON.stringify(sourceRefs)
      );
    }
    return ok({ markdown, summaryId });
  });
}
