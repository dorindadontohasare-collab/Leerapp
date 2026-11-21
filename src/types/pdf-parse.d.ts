declare module 'pdf-parse' {
  interface PdfParseResult { text: string; numpages: number; info?: Record<string, unknown> }
  function pdfParse(buffer: Buffer, opts?: unknown): Promise<PdfParseResult>;
  export = pdfParse;
}
