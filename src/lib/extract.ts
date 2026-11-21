export interface ExtractResult {
  text: string;
  pages?: number;
  meta: Record<string, unknown>;
}

/** Extraheert platte tekst uit een buffer op basis van bestandstype. */
export async function extractText(kind: string, buffer: Buffer): Promise<ExtractResult> {
  switch (kind) {
    case 'pdf':
      return extractPdf(buffer);
    case 'docx':
      return extractDocx(buffer);
    case 'pptx':
      return extractPptx(buffer);
    case 'txt':
    case 'md':
    case 'text':
      return { text: buffer.toString('utf8'), meta: {} };
    case 'csv':
      return extractCsv(buffer);
    case 'doc':
    case 'ppt': {
      const maybe = buffer.toString('utf8');
      const text = maybe.replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (text.length < 40) {
        throw new Error('Het oude .doc/.ppt-formaat kon niet betrouwbaar worden uitgelezen. Converteer het bestand naar .docx of .pptx (Word/PowerPoint > Opslaan als).');
      }
      return { text, meta: { warning: 'Oud binair formaat: tekst kon mogelijk niet volledig worden hersteld.' } };
    }
    default:
      throw new Error(`Extractie wordt niet ondersteund voor type "${kind}".`);
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  try {
    const pdfParse = (await import('pdf-parse')).default as unknown as (b: Buffer, opts?: unknown) => Promise<{ text: string; numpages: number }>;
    const data = await pdfParse(buffer);
    return { text: data.text ?? '', pages: data.numpages, meta: {} };
  } catch (err) {
    throw new Error(`PDF kon niet worden uitgelezen: ${err instanceof Error ? err.message : 'onbekende fout'}. Als het een scan is, gebruik dan AI-OCR of een digitale versie.`);
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = await import('mammoth');
  const result = await (mammoth as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }).extractRawText({ buffer });
  return { text: result.value, meta: {} };
}

async function extractPptx(buffer: Buffer): Promise<ExtractResult> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => {
    const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
    const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
    return na - nb;
  });
  const parts: string[] = [];
  const ents: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string');
    const text = xml
      .replace(/<a:br\s*\/?>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ents[m] ?? m)
      .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    const slideNo = Number(name.match(/slide(\d+)/)?.[1] ?? 0);
    parts.push(`\n--- Dia ${slideNo} ---\n${text}`);
  }
  return { text: parts.join('\n'), pages: slideFiles.length, meta: {} };
}

async function extractCsv(buffer: Buffer): Promise<ExtractResult> {
  const Papa = (await import('papaparse')).default;
  const parsed = Papa.parse(buffer.toString('utf8'), { header: false, skipEmptyLines: true });
  const rows = (parsed.data as string[][]).map((r) => r.join(' | '));
  return { text: rows.join('\n'), meta: { rows: rows.length } };
}
