"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  FolderOpen,
  Loader2,
  Mail,
  RefreshCw,
  Upload,
  Users,
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

const SOURCES = [
  { id: "odoo", label: "Odoo ERP", desc: "Sincronización continua", icon: Database },
  { id: "quickbooks", label: "QuickBooks", desc: "Sincronización continua", icon: Database },
  { id: "carpeta", label: "Carpeta", desc: "Subida masiva de archivos", icon: FolderOpen },
  { id: "correo", label: "Correo", desc: "Canal corporativo", icon: Mail },
] as const;

type SourceId = (typeof SOURCES)[number]["id"];

/**
 * Muestras para la validación en tiempo real del Paso 3: el veredicto del motor
 * se recalcula automáticamente ante cada cambio de la whitelist de proveedores.
 */
const LIVE_PREVIEW_SAMPLES = [
  { label: "DevCorp · autorizado", rawText: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo" },
  { label: "HackerLabs · no autorizado", rawText: "Factura INV-999 de HackerLabs por 300 USD, vence 2026-11-20, concepto: consultoría" },
  { label: "LatamDesign · sobre límite", rawText: "Factura INV-301 de LatamDesign por 1850 USD, vence 2026-12-01, concepto: rediseño" },
] as const;

/**
 * Wizard de demo en 3 fases (sandbox determinista, sin autoridad financiera):
 *   1. Fuente de datos (ERP / archivos / carpetas / correo).
 *   2. Reglas dinámicas (límites y capacidad del equipo).
 *   3. Proveedores autorizados + validación en tiempo real + movimiento manual.
 */
export function DemoWizard() {
  const [step, setStep] = useState<Step>(1);

  const [source, setSource] = useState<SourceId>("odoo");
  const [connected, setConnected] = useState(false);

  const [budget, setBudget] = useState(defaultCompanyRules.presupuesto_mensual_restante);
  const [limit, setLimit] = useState(defaultCompanyRules.limite_monto_automatico);
  const [analysts, setAnalysts] = useState(3);
  const [providers, setProviders] = useState<string[]>(defaultCompanyRules.proveedores_permitidos);
  const [newProvider, setNewProvider] = useState("");

  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
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

  // Validación en tiempo real: el motor evalúa muestras con las reglas vigentes.
  const livePreview = useMemo(
    () =>
      LIVE_PREVIEW_SAMPLES.map((sample) => {
        const base = deterministicExtract(sample.rawText);
        const invoice = finalizeDeterministicExtraction(base);
        const decision = evaluateInvoice(invoice, effectiveRules, [], [], [], () =>
          new Date("2026-01-01T00:00:00.000Z"),
        );
        return { label: sample.label, invoice, decision };
      }),
    [effectiveRules],
  );

  const sourceLabel = SOURCES.find((s) => s.id === source)?.label ?? "Fuente";

  function pushResult(invoice: Invoice, rawText: string, sourceName: string) {
    const decision = evaluateInvoice(invoice, effectiveRules, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    setResults((prev) => [
      { id: `${invoice.id}-${Date.now()}`, invoice, decision, rawText, source: sourceName, humanAction: null },
      ...prev,
    ]);
  }

  async function connectSource() {
    setConnecting(true);
    try {
      await wait(700);
      setConnected(true);
      await processBatch();
    } finally {
      setConnecting(false);
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
        pushResult(invoice, sample.rawText, sourceLabel);
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
            <h2 className="text-lg font-medium text-zinc-100">Fuente de datos</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Conecta el origen que alimenta al agente de forma continua.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {SOURCES.map((s) => {
                const Icon = s.icon;
                const active = source === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSource(s.id)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 ${
                      active
                        ? "border-zinc-500 bg-zinc-900 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-[11px] text-zinc-500">{s.desc}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void connectSource()}
              disabled={connecting || busy}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200 disabled:opacity-60"
            >
              {connecting || busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analizando con IA (DeepSeek)…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Conectar y sincronizar
                </>
              )}
            </button>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Subida masiva
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) void processFile(files[0]);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-10 items-center gap-1.5 text-xs text-zinc-500">
                {connected ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                    Conectado a {sourceLabel}
                  </>
                ) : (
                  "Aún sin conectar"
                )}
              </span>
            </div>

            {errors.global && <p className="mt-3 text-xs text-amber-400">{errors.global}</p>}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </IOSGlassCard>
        )}

        {step === 2 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Reglas dinámicas</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Criterios retroalimentados desde {sourceLabel} y configurables en tiempo real.
            </p>

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
                  <label className="text-sm text-zinc-400">Límite de aprobación automática</label>
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
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <Users className="h-4 w-4" />
                    Analistas compartidos
                  </label>
                  <span className="font-mono text-sm text-zinc-100">{analysts}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={analysts}
                  onChange={(e) => setAnalysts(Number(e.target.value))}
                  className="w-full accent-zinc-300"
                />
              </div>
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
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </IOSGlassCard>
        )}

        {step === 3 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Proveedores autorizados</h2>
            <p className="mt-1 text-xs text-zinc-500">
              La whitelist se refleja en el motor en tiempo real.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
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
                    {active ? "✓ " : ""}
                    {p}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
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

            {/* Validación en tiempo real */}
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Validación en tiempo real
              </p>
              <div className="space-y-2">
                {livePreview.map((p) => (
                  <div key={p.label} className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-zinc-400">{p.label}</span>
                    <IOSStatusBadge estado={p.decision.estado} />
                  </div>
                ))}
              </div>
            </div>

            {/* Registro inmutable y movimiento manual */}
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-medium text-zinc-300">Registro y supervisión</h3>
              </div>

              {results.length === 0 ? (
                <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-sm text-zinc-500">
                  Sin facturas procesadas. Conecta una fuente en el Paso 1.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
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
            </div>

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