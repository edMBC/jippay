import { deterministicExtract, finalizeDeterministicExtraction } from "./extractor";
import { parseInvoiceBatchCsv } from "./erp/erp-connector";
import { InvoiceSchema, type Invoice } from "./schemas";
import { sanitizeInvoiceInput, sha256Hex } from "./security";

/**
 * Ingesta multimodal de archivos: PDF, imágenes (PNG/JPG/WebP), correos .eml,
 * texto .txt, CSV y JSON. Extrae texto, calcula SHA-256, normaliza multimoneda
 * y produce una factura lista para el motor determinista.
 */

export interface IngestedInvoice {
  invoice: Invoice;
  fileHash: string;
  fileName: string;
  mimeType: string;
  rawText: string;
}

const TEXT_TYPES = new Set(["txt", "eml", "csv", "json", "md"]);
const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "webp"]);

export function detectMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "eml":
      return "message/rfc822";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "txt":
    default:
      return "text/plain";
  }
}

function decodeText(buffer: Uint8Array): string {
  return new TextDecoder("utf-8").decode(buffer);
}

// Extracción de texto de PDF vía operadores de contenido (sin dependencias).
function extractPdfText(buffer: Uint8Array): string {
  const latin1 = new TextDecoder("latin1").decode(buffer);
  const fragments: string[] = [];

  const tjMatches = latin1.match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g);
  if (tjMatches) {
    for (const m of tjMatches) {
      const inner = m.match(/\((.*)\)\s*Tj/);
      if (inner) fragments.push(inner[1]);
    }
  }

  const tjArray = latin1.match(/\[(\([^)]*\)\s*)+]\s*TJ/g);
  if (tjArray) {
    for (const m of tjArray) {
      const parts = m.match(/\(([^)]*)\)/g);
      if (parts) fragments.push(parts.map((p) => p.slice(1, -1)).join(""));
    }
  }

  if (fragments.length > 0) {
    return fragments
      .join("\n")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, "\n");
  }

  // Fallback: extraer runs ASCII legibles.
  const runs = latin1.match(/[\x20-\x7E]{6,}/g);
  return runs ? runs.join("\n") : "";
}

// Extracción de texto de imágenes: SOLO se usa contenido embebido (chunks de texto
// PNG / XML de SVG). El nombre del archivo NO es evidencia documental válida, por lo
// que nunca se fabrica una factura a partir de él.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function extractPngTextChunks(buffer: Uint8Array): string {
  if (buffer.length < 8) return "";
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return "";
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const fragments: string[] = [];
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) break;

    if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
      const data = buffer.subarray(dataStart, dataEnd);
      const text = new TextDecoder("latin1").decode(data);
      const sep = text.indexOf("\0");
      const value = sep >= 0 ? text.slice(sep + 1) : text;
      // zTXt y los iTXt comprimidos (flag=1) van en zlib; los descartamos como ruido.
      const isCompressed = type === "zTXt" || (type === "iTXt" && value.charCodeAt(1) === 1);
      if (!isCompressed && value.trim()) fragments.push(value.trim());
    }

    offset = dataEnd + 4; // skip CRC
  }

  return fragments.join("\n");
}

function extractSvgText(buffer: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(buffer);
  if (!/<svg/i.test(text)) return "";
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageText(buffer: Uint8Array): string {
  return extractPngTextChunks(buffer) || extractSvgText(buffer);
}

export function extractTextFromBuffer(
  buffer: Uint8Array,
  fileName: string,
  mimeType: string,
): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (TEXT_TYPES.has(ext) || mimeType.startsWith("text/") || mimeType === "message/rfc822") {
    return decodeText(buffer);
  }
  if (ext === "pdf" || mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }
  if (IMAGE_TYPES.has(ext) || mimeType.startsWith("image/")) {
    return extractImageText(buffer);
  }
  return decodeText(buffer);
}

function normalizeToInvoice(rawText: string, fileName: string, fileHash: string): Invoice {
  const security = sanitizeInvoiceInput(rawText);
  const base = deterministicExtract(rawText);
  const invoice = finalizeDeterministicExtraction(base);

  return InvoiceSchema.parse({
    ...invoice,
    security_alert: security.alert,
    fileHash,
    fileName,
  });
}

/**
 * Documento sin evidencia textual fiable: no se fabrica una factura ficticia.
 * El importe es DESCONOCIDO (no cero) y se marca explícitamente como documento
 * no procesable para que el motor derive a revisión humana (`REGLA_DOCUMENTO_NO_PROCESABLE`),
 * nunca a una autorización automática ni a un bloqueo por "importe inválido".
 */
function unprocessableInvoice(fileHash: string, fileName: string): Invoice {
  return {
    id: `UNPROCESSABLE-${fileHash.slice(0, 8).toUpperCase()}`,
    emisor: "ProveedorDesconocido",
    monto: 0,
    moneda: "USD",
    fecha_vencimiento: new Date().toISOString().slice(0, 10),
    concepto: "Documento no procesable: sin evidencia textual fiable",
    fecha_vencimiento_inferida: true,
    moneda_inferida: true,
    extraction_engine: "deterministic-fallback",
    confidence_score: 0,
    critical_fields: {
      emisor_reliable: false,
      monto_reliable: false,
      moneda_reliable: false,
      id_reliable: false,
      fecha_reliable: false,
    },
    documento_no_procesable: true,
    fileHash,
    fileName,
  };
}

export async function ingestFile(
  buffer: Uint8Array,
  fileName: string,
): Promise<IngestedInvoice> {
  const mimeType = detectMimeType(fileName);
  const fileHash = sha256Hex(buffer);
  const rawText = extractTextFromBuffer(buffer, fileName, mimeType);
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // Imágenes sin texto embebido: no fabricar factura a partir del nombre de archivo.
  const isImage = IMAGE_TYPES.has(ext) || mimeType.startsWith("image/");
  if (isImage && !rawText.trim()) {
    return {
      invoice: unprocessableInvoice(fileHash, fileName),
      fileHash,
      fileName,
      mimeType,
      rawText,
    };
  }

  let invoice: Invoice;

  if (ext === "csv") {
    const batch = parseInvoiceBatchCsv(rawText);
    if (batch.length > 0) {
      const first = finalizeDeterministicExtraction(batch[0]);
      invoice = InvoiceSchema.parse({
        ...first,
        security_alert: sanitizeInvoiceInput(rawText).alert,
        fileHash,
        fileName,
      });
    } else {
      invoice = normalizeToInvoice(rawText, fileName, fileHash);
    }
  } else {
    invoice = normalizeToInvoice(rawText, fileName, fileHash);
  }

  return { invoice, fileHash, fileName, mimeType, rawText };
}
