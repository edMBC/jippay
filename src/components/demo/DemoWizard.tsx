"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Upload,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { evaluateInvoice } from "@/lib/engine";
import { deterministicExtract, finalizeDeterministicExtraction } from "@/lib/extractor";
import { ingestFile } from "@/lib/multimodal-ingestor";
import { defaultCompanyRules, sampleRawInvoices } from "@/lib/mock-data";
import type { AgentDecision, CompanyRules, Invoice } from "@/lib/schemas";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";
import { IOSStatusBadge } from "@/components/ui/IOSStatusBadge";

type Step = 1 | 2 | 3;

interface DemoResult {
  id: string;
  invoice: Invoice;
  decision: AgentDecision;
  rawText: string;
  source: string;
  humanAction: "APROBADO" | "RECHAZADO" | null;
  justification?: string;
}

const PRESET_PROVIDERS = ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"];

const SAMPLE_TEXT =
  "Factura INV-301 de LatamDesign por 1850 USD, vence 2026-12-01, concepto: rediseño de identidad";

const CHANNELS = [
  { label: "CSV", icon: FileText },
  { label: "PDF", icon: FileText },
  { label: "Foto", icon: ImageIcon },
  { label: "Correo", icon: Mail },
] as const;

/**
 * Wizard de demo en 3 fases (sandbox determinista, sin autoridad financiera):
 *   1. Política (criterio del CFO).
 *   2. Ingesta (escala ERP / archivos).
 *   3. Veredicto + movimiento manual.
 */
export function DemoWizard() {
  const [step, setStep] = useState<Step>(1);
  const [budget, setBudget] = useState(defaultCompanyRules.presupuesto_mensual_restante);
  const [limit, setLimit] = useState(defaultCompanyRules.limite_monto_automatico);
  const [providers, setProviders] = useState<string[]>(defaultCompanyRules.proveedores_permitidos);
  const [newProvider, setNewProvider] = useState("");

  const [text, setText] = useState(SAMPLE_TEXT);
  const [busy, setBusy] = useState(false);
  const [memorizing, setMemorizing] = useState(false);
  const [results, setResults] = useState<DemoResult[]>([]);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveRules = useMemo<CompanyRules>(
    () => ({
      limite_monto_automatico: limit,
      presupuesto_mensual_restante: budget,
      proveedores_permitidos: providers,
      acuerdos_por_proveedor: defaultCompanyRules.acuerdos_por_proveedor,
    }),
    [budget, limit, providers],
  );

  function pushResult(invoice: Invoice, rawText: string, source: string) {
    const decision = evaluateInvoice(invoice, effectiveRules, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    setResults((prev) => [
      { id: `${invoice.id}-${Date.now()}`, invoice, decision, rawText, source, humanAction: null },
      ...prev,
    ]);
  }

  async function processTextSample() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await wait(600);
      const base = deterministicExtract(text);
      const invoice = finalizeDeterministicExtraction(base);
      pushResult(invoice, text, "Texto");
    } finally {
      setBusy(false);
    }
  }

  async function processFile(file: File) {
    setBusy(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const { invoice, rawText } = await ingestFile(buffer, file.name || "factura");
      pushResult(invoice, rawText || `Archivo: ${file.name}`, "Archivo");
    } catch {
      setErrors((prev) => ({ ...prev, global: "No se pudo procesar el archivo." }));
    } finally {
      setBusy(false);
    }
  }

  async function processBatch() {
    setBusy(true);
    try {
      await wait(900);
      for (const sample of sampleRawInvoices.slice(0, 6)) {
        const base = deterministicExtract(sample.rawText);
        const invoice = finalizeDeterministicExtraction(base);
        pushResult(invoice, sample.rawText, "Lote");
      }
    } finally {
      setBusy(false);
    }
  }

  function submitHumanAction(id: string, action: "APROBADO" | "RECHAZADO") {
    const justification = (justifications[id] ?? "").trim();
    if (justification.length < 10) {
      setErrors((prev) => ({ ...prev, [id]: "Justificación mínima: 10 caracteres." }));
      return;
    }
    setResults((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, humanAction: action, justification, decision: { ...r.decision, approved_by: "demo" } }
          : r,
      ),
    );
    setErrors((prev) => ({ ...prev, [id]: "" }));
  }

  async function confirmPolicy() {
    setMemorizing(true);
    await wait(900);
    setMemorizing(false);
    goToStep(2);
  }

  function goToStep(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const escaladas = results.filter((r) => r.decision.estado === "ESCALAR");

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Indicador de fases */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {([1, 2, 3] as const).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToStep(n)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                step === n
                  ? "bg-zinc-100 text-zinc-950"
                  : step > n
                    ? "border border-zinc-600 text-zinc-300"
                    : "border border-zinc-700 text-zinc-600"
              }`}
            >
              {n}
            </button>
            {n < 3 && <span className="h-px w-8 bg-zinc-700" />}
          </div>
        ))}
      </div>

      {/* Contenido por fase con transición suave */}
      <div key={step} className="animate-fade-slide">
        {step === 1 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Política de aprobación</h2>
            <p className="mt-1 text-xs text-zinc-500">Criterio que el agente aplicará a cada factura.</p>

            <div className="mt-6 space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm text-zinc-400">Presupuesto mensual</label>
                  <span className="font-mono text-sm text-zinc-100">${budget.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={50000}
                  step={500}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full accent-zinc-300"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm text-zinc-400">Límite automático</label>
                  <span className="font-mono text-sm text-zinc-100">${limit.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={5000}
                  step={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full accent-zinc-300"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Proveedores autorizados</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PROVIDERS.map((p) => {
                    const active = providers.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setProviders((prev) => (active ? prev.filter((x) => x !== p) : [...prev, p]))
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                          active
                            ? "bg-zinc-100 text-zinc-950"
                            : "border border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value)}
                    placeholder="Añadir proveedor…"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = newProvider.trim();
                      if (name) {
                        setProviders((prev) => (prev.includes(name) ? prev : [...prev, name]));
                        setNewProvider("");
                      }
                    }}
                    className="rounded-lg bg-zinc-800 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    Añadir
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void confirmPolicy()}
              disabled={memorizing}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200 disabled:opacity-60"
            >
              {memorizing ? (
                <>
                  <BrainCircuit className="h-4 w-4 animate-pulse" />
                  Memorizando política…
                </>
              ) : (
                <>
                  Confirmar política
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </IOSGlassCard>
        )}

        {step === 2 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Ingesta</h2>
            <p className="mt-1 text-xs text-zinc-500">Captura a escala desde ERP o archivos.</p>

            {busy && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando con IA (DeepSeek)…
              </div>
            )}

            <div className="mt-4 grid grid-cols-4 gap-2">
              {CHANNELS.map((c) => (
                <div
                  key={c.label}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-2 py-3 text-center"
                >
                  <c.icon className="h-5 w-5 text-zinc-400" />
                  <span className="text-[11px] text-zinc-500">{c.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-zinc-400">Factura de texto</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void processTextSample()}
                  disabled={busy}
                  className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Procesar
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Subir archivo
                </button>
                <button
                  type="button"
                  onClick={() => void processBatch()}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" />
                  Sincronizar lote
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processFile(file);
                    e.target.value = "";
                  }}
                />
              </div>

              {errors.global && <p className="text-xs text-amber-400">{errors.global}</p>}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 transition-all duration-200 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </button>
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200"
              >
                Ver registro
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </IOSGlassCard>
        )}

        {step === 3 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Registro y supervisión</h2>
            <p className="mt-1 text-xs text-zinc-500">Veredicto determinista con intervención humana cuando procede.</p>

            {results.length === 0 ? (
              <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-sm text-zinc-500">
                Sin facturas procesadas. Vuelve a la ingesta.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {results.map((r) => (
                  <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-all duration-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-zinc-400">{r.invoice.id}</span>
                        <p className="truncate text-sm text-zinc-200">
                          {r.invoice.emisor} · ${r.invoice.monto_usd ?? r.invoice.monto}
                        </p>
                      </div>
                      <IOSStatusBadge estado={r.decision.estado} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">{r.decision.razon}</p>

                    {r.decision.estado === "ESCALAR" && r.humanAction === null && (
                      <div className="mt-3 border-t border-zinc-800 pt-3">
                        <textarea
                          value={justifications[r.id] ?? ""}
                          onChange={(e) => setJustifications((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          rows={2}
                          placeholder="Justificación (mín. 10 caracteres)"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                        />
                        {errors[r.id] && <p className="mt-1 text-[11px] text-amber-400">{errors[r.id]}</p>}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitHumanAction(r.id, "APROBADO")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-all duration-200 hover:bg-zinc-200"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => submitHumanAction(r.id, "RECHAZADO")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-all duration-200 hover:text-zinc-200"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Frenar
                          </button>
                        </div>
                      </div>
                    )}

                    {r.humanAction && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs">
                        {r.humanAction === "APROBADO" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-zinc-500" />
                        )}
                        <span className="text-zinc-400">
                          {r.humanAction === "APROBADO" ? "Aprobado para pago" : "Frenado"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {escaladas.length > 0 && (
              <p className="mt-4 text-center text-[11px] text-zinc-600">
                {escaladas.length} pendiente{escaladas.length === 1 ? "" : "s"} de supervisión.
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 transition-all duration-200 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200"
              >
                Reiniciar
              </button>
            </div>
          </IOSGlassCard>
        )}
      </div>
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}