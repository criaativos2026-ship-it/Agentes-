import "server-only";
import Papa from "papaparse";

export type Extracted = { kind: "text" | "table"; text: string; header?: string[]; rows?: string[][] };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/x-markdown"],
  csv: ["text/csv", "application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export function fileKind(name: string, mime: string): keyof typeof ACCEPTED | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext in ACCEPTED) return ext as keyof typeof ACCEPTED;
  for (const [k, mimes] of Object.entries(ACCEPTED)) if (mimes.includes(mime)) return k as keyof typeof ACCEPTED;
  return null;
}

/** Confere a assinatura do arquivo (não confia só na extensão). */
function assertMagic(kind: string, buf: Buffer) {
  const head = buf.subarray(0, 4).toString("latin1");
  if (kind === "pdf" && !head.startsWith("%PDF")) throw new Error("O arquivo não é um PDF válido.");
  if ((kind === "docx" || kind === "xlsx") && head !== "PK\u0003\u0004") throw new Error("O arquivo não é um documento Office válido.");
}

const clean = (s: string) => s.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export async function extractText(name: string, mime: string, buf: Buffer): Promise<Extracted> {
  const kind = fileKind(name, mime);
  if (!kind) throw new Error("Formato não suportado. Use PDF, DOCX, TXT, MD, CSV ou XLSX.");
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new Error("Arquivo maior que 10 MB.");
  assertMagic(kind, buf);
  if (kind === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const r = await parser.getText();
      return { kind: "text", text: clean(r.text) };
    } finally {
      await parser.destroy();
    }
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    return { kind: "text", text: clean(r.value) };
  }
  if (kind === "txt" || kind === "md") return { kind: "text", text: clean(buf.toString("utf8")) };
  if (kind === "csv") {
    const parsed = Papa.parse<string[]>(buf.toString("utf8").replace(/^﻿/, ""), { skipEmptyLines: true });
    const [header, ...rows] = parsed.data;
    if (!header?.length) throw new Error("CSV vazio.");
    return { kind: "table", text: "", header: header.map((h) => h.trim()), rows: rows.slice(0, 50000) };
  }
  // xlsx: primeira planilha
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Planilha vazia.");
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result ?? "");
      if (typeof v === "object" && v && "text" in v) return String((v as { text: unknown }).text ?? "");
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v);
    });
    all.push(values);
  });
  const [header, ...rows] = all;
  if (!header?.length) throw new Error("Planilha vazia.");
  return { kind: "table", text: "", header: header.map((h) => h.trim()), rows: rows.slice(0, 50000) };
}

/** Divide texto em trechos (~1.200 caracteres, sobreposição de ~200), preferindo quebras de parágrafo. */
export function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = cur.length > overlap ? cur.slice(-overlap) : "";
  };
  for (const p of paras) {
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size - overlap) {
        if (cur) push();
        cur = p.slice(i, i + size);
        push();
      }
      cur = "";
      continue;
    }
    if (cur.length + p.length + 2 > size) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  if (cur.trim() && (chunks.length === 0 || !chunks[chunks.length - 1].endsWith(cur.trim()))) chunks.push(cur.trim());
  return chunks;
}

/** Tabelas viram trechos em CSV, cada um com o cabeçalho (permite busca textual e reanálise exata). */
export function chunkTable(header: string[], rows: string[][], rowsPerChunk = 40): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    out.push(Papa.unparse({ fields: header, data: rows.slice(i, i + rowsPerChunk) }));
  }
  return out.length ? out : [Papa.unparse({ fields: header, data: [] })];
}
