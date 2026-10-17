import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { InvoiceSchema, type CompanyRules, type Invoice } from "./schemas";
import { convertToUsd } from "./security";

/**
 * Extractor neuro-simbólico.
 * - Si existe DEEPSEEK_API_KEY, usa DeepSeek vía Vercel AI SDK con structured output.
 * - Si no hay API key o la red falla, ejecuta un parser determinista (Regex + heurísticas).
 */

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

// Tasas de referencia fijas para normalizar a USD en el fallback determinista.
const USD_RATES: Record<string, number> = {
  USD: 1,
  COP: 4000,
  MXN: 18,
  ARS: 1000,
  BRL: 5,
};

const KNOWN_PROVIDERS = [
  "DevCorp",
  "LatamDesign",
  "CloudHost",
  "AndesConsulting",
  "HackerLabs",
];

const SPANISH_NUMBERS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientas: 200,
  doscientos: 200,
  trescientas: 300,
  trescientos: 300,
  cuatrocientas: 400,
  cuatrocientos: 400,
  quinientas: 500,
  quinientos: 500,
  seiscientas: 600,
  seiscientos: 600,
  setecientas: 700,
  setecientos: 700,
  ochocientas: 800,
  ochocientos: 800,
  novecientas: 900,
  novecientos: 900,
  mil: 1000,
  millón: 1000000,
  millones: 1000000,
};

function wordsToNumber(phrase: string): number | null {
  const tokens = phrase.trim().toLowerCase().split(/\s+/);
  let total = 0;
  let current = 0;
  let matched = false;
  for (const token of tokens) {
    const value = SPANISH_NUMBERS[token];
    if (value == null) return null;
    matched = true;
    if (value === 1000 || value === 1000000) {
      current = (current || 1) * value;
      total += current;
      current = 0;
    } else if (value === 100) {
      current = current ? current * value : value;
    } else {
      current += value;
    }
  }
  if (!matched) return null;
  total += current;
  return total > 0 ? total : null;
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `GEN-${Math.abs(hash).toString(16).toUpperCase()}`;
}

function findId(text: string): string {
  const invMatch = text.match(/INV[- ]?(\d+)/i);
  if (invMatch) return `INV-${invMatch[1]}`;
  const labelMatch = text.match(/(?:id|n[úu]mero|factura)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
  if (labelMatch) return labelMatch[1].toUpperCase();
  return hashText(text);
}

function findEmisor(text: string): string {
  const lower = text.toLowerCase();
  for (const provider of KNOWN_PROVIDERS) {
    if (lower.includes(provider.toLowerCase())) return provider;
  }
  const labelMatch = text.match(/(?:emisor|proveedor)\s*[:]\s*([A-Za-z0-9&. ]+)/i);
  if (labelMatch) {
    const name = labelMatch[1].trim();
    if (name && !name.includes("@")) return name;
  }
  const emailMatch = text.match(/([a-z0-9._%+-]+)@([a-z0-9.-]+)\./i);
  if (emailMatch) {
    const domain = emailMatch[2];
    const mapped = KNOWN_PROVIDERS.find(
      (p) => domain.includes(p.toLowerCase()) || p.toLowerCase().includes(domain),
    );
    if (mapped) return mapped;
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  return "ProveedorDesconocido";
}

function findCurrency(text: string): string {
  const match = text.match(/\b(USD|COP|MXN|ARS|BRL)\b/i);
  return match ? match[1].toUpperCase() : "USD";
}

function parseNumeric(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  // Formato europeo: 1.250,00
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(value)) {
    return parseFloat(value.replace(/\./g, "").replace(",", "."));
  }
  // Formato americano: 1,250.00
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) {
    return parseFloat(value.replace(/,/g, ""));
  }

  const cleaned = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findAmount(text: string): number | null {
  // 1. Monto con signo de dólar.
  const dollar = text.match(/\$\s*(\d[\d.,]*)/);
  if (dollar) {
    const parsed = parseNumeric(dollar[1]);
    if (parsed != null) return parsed;
  }

  // 2. Número seguido de código de moneda.
  const labeled = text.match(/(\d[\d.,]*)\s*(?:USD|COP|MXN|ARS|BRL)\b/i);
  if (labeled) {
    const parsed = parseNumeric(labeled[1]);
    if (parsed != null) return parsed;
  }

  // 3. Etiquetas de monto.
  const label = text.match(/(?:monto|total|importe|amount)[^\d$]*?(\d[\d.,]*)/i);
  if (label) {
    const parsed = parseNumeric(label[1]);
    if (parsed != null) return parsed;
  }

  // 4. Monto en palabras (ej. "mil doscientos dólares").
  const numberWords = Object.keys(SPANISH_NUMBERS).sort((a, b) => b.length - a.length);
  const runPattern = numberWords.join("|");
  const wordsRe = new RegExp(
    `((?:${runPattern})(?:\\s+(?:${runPattern}))*)\\s+(?:d[oó]lares|pesos)\\b`,
    "gi",
  );
  const wordsMatch = wordsRe.exec(text);
  if (wordsMatch) {
    const parsed = wordsToNumber(wordsMatch[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

interface DateExtraction {
  date: string;
  inferred: boolean;
}

function findDate(text: string): DateExtraction {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, inferred: false };

  const ddmm = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (ddmm) {
    const day = ddmm[1].padStart(2, "0");
    const month = ddmm[2].padStart(2, "0");
    return { date: `${ddmm[3]}-${month}-${day}`, inferred: false };
  }

  return { date: new Date().toISOString().slice(0, 10), inferred: true };
}

function findConcepto(text: string): string {
  const match = text.match(/concepto\s*[:]\s*(.+)/i);
  if (match) return match[1].trim();
  return "Sin concepto";
}

function findMontoAcordado(text: string): number | undefined {
  const match = text.match(/(?:acordado|acuerdo|acordada)\s*[:=]?\s*\$?\s*(\d[\d.,]*)/i);
  if (!match) return undefined;
  return parseNumeric(match[1]) ?? undefined;
}

/**
 * Parser determinista de respaldo: extrae una factura de texto crudo sin LLM.
 */
export function deterministicExtract(rawText: string): Invoice {
  const text = rawText.replace(/\r/g, "");
  const currency = findCurrency(text);
  const rawAmount = findAmount(text);
  const dateResult = findDate(text);

  let monto = rawAmount ?? 0;
  let moneda = currency;
  if (rawAmount != null && currency !== "USD" && USD_RATES[currency]) {
    monto = Math.round((rawAmount / USD_RATES[currency]) * 100) / 100;
    moneda = "USD";
  }

  return {
    id: findId(text),
    emisor: findEmisor(text),
    monto,
    moneda,
    fecha_vencimiento: dateResult.date,
    fecha_vencimiento_inferida: dateResult.inferred,
    concepto: findConcepto(text),
    monto_acordado: findMontoAcordado(text),
  };
}

const LlmInvoiceSchema = InvoiceSchema.omit({
  extraction_engine: true,
  agent_reasoning: true,
  confidence_score: true,
  system_prompt_preview: true,
  fecha_vencimiento_inferida: true,
});

/**
 * Construye el System Prompt dinámico inyectando las reglas de negocio actuales.
 * Es el "contexto del agente": whitelist, acuerdos y límites ajustan cómo lee.
 */
export function buildAgentSystemPrompt(rules?: CompanyRules): string {
  const proveedores = rules?.proveedores_permitidos ?? [];
  const acuerdos = rules?.acuerdos_por_proveedor ?? {};
  const limite = rules?.limite_monto_automatico;
  const presupuesto = rules?.presupuesto_mensual_restante;

  const partes: string[] = [
    "Eres el extractor contextual del agente Jippay (neuro-simbólico).",
    "Tu única tarea es leer un documento y devolver datos estructurados; nunca apruebes pagos ni tomes decisiones de negocio.",
  ];

  if (proveedores.length > 0) {
    partes.push(`Proveedores permitidos (whitelist): ${proveedores.join(", ")}.`);
  }

  const acuerdosLista = Object.entries(acuerdos)
    .map(([proveedor, monto]) => `${proveedor}=${monto}`)
    .join(", ");
  if (acuerdosLista) {
    partes.push(`Acuerdos por proveedor (monto máximo acordado, USD): ${acuerdosLista}.`);
  }

  if (limite != null) partes.push(`Límite de aprobación automática: ${limite} USD.`);
  if (presupuesto != null) partes.push(`Presupuesto mensual restante: ${presupuesto} USD.`);

  partes.push(
    "Extrae el monto en su moneda original e indica el código ISO correcto (USD, COP, MXN, ARS, BRL, EUR). No conviertas monedas: la normalización la hace el sistema.",
  );
  return partes.join("\n");
}

function estimateDeterministicConfidence(invoice: Invoice, fechaInferida: boolean): number {
  let score = 40;
  if (!invoice.id.startsWith("GEN-")) score += 15;
  if (invoice.emisor !== "ProveedorDesconocido") score += 20;
  if (invoice.monto > 0) score += 15;
  if (!fechaInferida) score += 10;
  return Math.max(0, Math.min(100, score));
}

function buildAgentReasoning(
  invoice: Invoice,
  engine: NonNullable<Invoice["extraction_engine"]>,
  fechaInferida: boolean,
): string {
  const motor =
    engine === "deepseek-llm"
      ? "DeepSeek (LLM contextual)"
      : "parser determinista (regex + heurísticas)";
  const notaFecha = fechaInferida
    ? " (la fecha no aparecía en el documento y se infirió)"
    : "";
  return `Motor: ${motor}. El agente interpretó el documento como la factura "${invoice.id}" del proveedor "${invoice.emisor}" por ${invoice.monto} ${invoice.moneda}, con vencimiento ${invoice.fecha_vencimiento}${notaFecha}.`;
}

function finalizeExtraction(
  base: Invoice,
  engine: NonNullable<Invoice["extraction_engine"]>,
  rules?: CompanyRules,
): Invoice {
  const fechaInferida =
    base.fecha_vencimiento_inferida === true ||
    !/^\d{4}-\d{2}-\d{2}$/.test(base.fecha_vencimiento ?? "");

  const conversion = convertToUsd(base.monto, base.moneda);
  const fecha = fechaInferida ? new Date().toISOString().slice(0, 10) : base.fecha_vencimiento;

  return {
    ...base,
    fecha_vencimiento: fecha,
    fecha_vencimiento_inferida: fechaInferida,
    monto_usd: conversion.monto_usd,
    tasa_cambio: conversion.tasa_cambio,
    extraction_engine: engine,
    agent_reasoning: buildAgentReasoning(
      { ...base, fecha_vencimiento: fecha },
      engine,
      fechaInferida,
    ),
    confidence_score:
      engine === "deepseek-llm" ? 92 : estimateDeterministicConfidence(base, fechaInferida),
    system_prompt_preview: rules ? buildAgentSystemPrompt(rules) : undefined,
  };
}

/**
 * Normaliza una extracción determinista a factura final (multimoneda + trazabilidad).
 * Reutilizada por la ingesta multimodal para que todos los caminos pasen por el mismo post-proceso.
 */
export function finalizeDeterministicExtraction(base: Invoice, rules?: CompanyRules): Invoice {
  return finalizeExtraction(base, "deterministic-fallback", rules);
}

/**
 * Extrae una factura estructurada desde texto crudo.
 * Usa IA (DeepSeek) cuando hay API key y cae en el parser determinista si falla.
 * Inyecta las CompanyRules dentro del System Prompt para dar contexto en tiempo real.
 */
export async function extractInvoiceFromText(
  rawText: string,
  rules?: CompanyRules,
): Promise<Invoice> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (apiKey) {
    try {
      const deepseek = createOpenAI({
        apiKey,
        baseURL: DEEPSEEK_BASE_URL,
      });

      const { object } = await generateObject({
        model: deepseek("deepseek-chat"),
        schema: LlmInvoiceSchema,
        prompt: `${buildAgentSystemPrompt(rules)}\n\nTexto crudo a extraer:\n${rawText}`,
      });

      return finalizeExtraction(
        { ...object, moneda: object.moneda ?? "USD" },
        "deepseek-llm",
        rules,
      );
    } catch {
      // Fallback resiliente ante errores de red o del proveedor.
    }
  }

  return finalizeExtraction(deterministicExtract(rawText), "deterministic-fallback", rules);
}
