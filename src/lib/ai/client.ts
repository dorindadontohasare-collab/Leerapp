/**
 * AI-modelroutering — draait uitsluitend server-side.
 * API-sleutels komen uitsluitend uit omgevingsvariabelen en worden nooit
 * naar de frontend gestuurd. De frontend ziet alleen de beschikbaarheidsstatus.
 */

export type AiTask =
  | 'document_analysis'
  | 'quiz_generation'
  | 'answer_grading'
  | 'summarization'
  | 'coach_chat'
  | 'vision_ocr'
  | 'speech_feedback'
  | 'forecast';

const DEFAULT_MODELS: Record<AiTask, string> = {
  document_analysis: 'mistral-large-latest',
  quiz_generation: 'mistral-large-latest',
  answer_grading: 'mistral-large-latest',
  summarization: 'mistral-small-latest',
  coach_chat: 'mistral-large-latest',
  vision_ocr: 'pixtral-large-latest',
  speech_feedback: 'mistral-large-latest',
  forecast: 'mistral-large-latest'
};

export function modelForTask(task: AiTask, userPreference?: string): string {
  const overrideKey = `AI_MODEL_${task.toUpperCase()}`;
  const override = process.env[overrideKey];
  if (override) return override;
  if (userPreference && userPreference !== 'auto') {
    if (task === 'vision_ocr') return userPreference.includes('pixtral') ? userPreference : 'pixtral-large-latest';
    return userPreference;
  }
  return DEFAULT_MODELS[task];
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string };

export interface VisionMessage { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI is niet geconfigureerd. Stel MISTRAL_API_KEY in via de omgevingsvariabelen.');
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

export function aiStatus(): { configured: boolean; provider: string; baseUrl: string } {
  return {
    configured: isAiConfigured(),
    provider: 'Mistral',
    baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1'
  };
}

const callCounts = new Map<string, { n: number; reset: number }>();

export function throttleInfo(userId: string): { perHour: number; used: number } {
  const entry = callCounts.get(userId);
  const perHour = Number(process.env.AI_CALLS_PER_HOUR || 120);
  if (!entry || entry.reset < Date.now()) return { perHour, used: 0 };
  return { perHour, used: entry.n };
}

const MAX_MESSAGES_BYTES = 1_500_000;

export async function callAi(opts: {
  userId: string;
  task: AiTask;
  messages: ChatMessage[] | VisionMessage[];
  userPreference?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}): Promise<{ content: string; model: string }> {
  if (!isAiConfigured()) throw new AiNotConfiguredError();

  const perHour = Number(process.env.AI_CALLS_PER_HOUR || 120);
  const entry = callCounts.get(opts.userId);
  if (entry && entry.reset > Date.now() && entry.n >= perHour) {
    throw new Error('Je AI-gebruikslimiet voor dit uur is bereikt. Probeer zo dadelijk opnieuw.');
  }

  const model = modelForTask(opts.task, opts.userPreference);
  const baseUrl = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: AbortSignal.timeout(120000)
  });

  const nextEntry = entry && entry.reset > Date.now() ? { n: entry.n + 1, reset: entry.reset } : { n: 1, reset: Date.now() + 3600000 };
  callCounts.set(opts.userId, nextEntry);

  if (res.status === 429) {
    throw new Error('De AI-dienst is momenteel overbelast (rate limit). Probeer het over enkele seconden opnieuw.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI-aanroep mislukt (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('De AI-dienst gaf een leeg antwoord. Probeer het opnieuw.');
  return { content, model: data.model || model };
}

export function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error('Kon het AI-antwoord niet als JSON lezen.');
  }
}
