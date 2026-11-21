export interface AppImportResult {
  kind: 'html' | 'zip' | 'html_url';
  entryPath?: string;
  files: string[];
  analysis: {
    title: string;
    description: string;
    hasIndex: boolean;
    scripts: string[];
    detectedQuizQuestions: number;
    detectedIntegrations: boolean;
    warnings: string[];
    features: string[];
  };
}

const BANNED_PATTERNS = [
  /fetch\s*\(\s*['"][^'"]*studybase/gi,
  /localStorage\.getItem\(\s*['"]sb_/gi,
  /indexedDB[^;]*sb_/gi
];

export async function analyzeHtml(html: string): Promise<AppImportResult['analysis']> {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? 'Naamloos';
  const desc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ?? '';
  const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]);
  return {
    title: title.trim(),
    description: desc.trim(),
    hasIndex: true,
    scripts,
    detectedQuizQuestions: countQuizSignals(html),
    detectedIntegrations: /replaceAll|postMessage/.test(html) && /studybase|result|isCorrect/.test(html),
    warnings: [],
    features: detectFeatures(html)
  };
}

function countQuizSignals(html: string): number {
  const signals = (html.match(/(meerdere|optie|antwoord|question|vraag)/gi) ?? []).length;
  const optionCount = (html.match(/(option[A-Z]|answer-|\.choice)/g) ?? []).length;
  return Math.min(999, Math.round((signals + optionCount) / 40));
}

function detectFeatures(html: string): string[] {
  const f: string[] = [];
  if (/canvas/i.test(html)) f.push('Canvas-visualisatie');
  if (/input|quiz|vraag/i.test(html)) f.push('Vragen / interactieve oefeningen');
  if (/score|result/i.test(html)) f.push('Resultatenpagina');
  if (/flashcard|kaart/i.test(html)) f.push('Flashcards');
  if (/timer|stopwatch/i.test(html)) f.push('Timer');
  return f;
}

export function sanitizeHtmlForSandbox(html: string): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = html;
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(out)) warnings.push('Verdachte verwijzing naar interne database / key-opslag aangetroffen en geblokkeerd.');
    out = out.replace(pattern, '/*GEBLOKKEERD*/');
  }
  return { html: out, warnings };
}
