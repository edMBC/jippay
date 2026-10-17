"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Database,
  Download,
  FolderOpen,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
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

type Step = 1 | 2 | 3 | 4;

interface DemoResult {
  id: string;
  invoice: Invoice;
  decision: AgentDecision;
  source: string;
  humanAction: "APROBADO" | "RECHAZADO" | null;
  justification?: string;
}

const PRESET_PROVIDERS = ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"];

const SOURCES = [
  { id: "odoo", label: "Odoo ERP", desc: "Sincronización de catálogos", icon: Database },
  { id: "quickbooks", label: "QuickBooks", desc: "Sincronización de catálogos", icon: Database },
  { id: "a2", label: "a2 ERP", desc: "Sincronización de catálogos", icon: Database },
  { id: "carpeta", label: "Carpetas de red", desc: "Archivos compartidos", icon: FolderOpen },
  { id: "correo", label: "Correo", desc: "Bandeja corporativa", icon: Mail },
] as const;

type SourceId = (typeof SOURCES)[number]["id"];

/**
 * Muestras para la validación en tiempo real del motor: el veredicto se
 * recalcula ante cada cambio de reglas o de la whitelist.
 */
const LIVE_PREVIEW_SAMPLES = [
  { label: "DevCorp · autorizado", rawText: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo" },
  { label: "HackerLabs · no autorizado", rawText: "Factura INV-999 de HackerLabs por 300 USD, vence 2026-11-20, concepto: consultoría" },
  { label: "LatamDesign · sobre límite", rawText: "Factura INV-301 de LatamDesign por 1850 USD, vence 2026-12-01, concepto: rediseño" },
] as const;

const STEP_LABELS = ["Fuente", "Criterios", "Ingesta", "Auditoría"] as const;

/**
 * Demo interactiva en 4 pasos. Usa el motor determinista real (`evaluateInvoice`)
 * y los extractores/ingestores reales: los veredictos no son estáticos. No escribe
 * en el ledger financiero (eso corresponde a la Terminal autenticada).
 */
export function DemoWizard() {
  const [step, setStep] = useState<Step>(1);

  // Paso 1 — fuente de datos.
  const [source, setSource] = useState<SourceId>("odoo");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [emailLinked, setEmailLinked] = useState(false);
  const [emailLinking, setEmailLinking] = useState(false);

  // Paso 2 — reglas dinámicas + whitelist.
  const [budget, setBudget] = useState(defaultCompanyRules.presupuesto_mensual_restante);
  const [limit, setLimit] = useState(defaultCompanyRules.limite_monto_automatico);
  const [analysts, setAnalysts] = useState(3);
  const [providers, setProviders] = useState<string[]>(defaultCompanyRules.proveedores_permitidos);
  const [newProvider, setNewProvider] = useState("");

  // Paso 3 — ingesta.
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Paso 4 — auditoría y veredicto.
  const [results, setResults] = useState<DemoResult[]>([]);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [erpSynced, setErpSynced] = useState<string | null>(null);
  const [syncingErp, setSyncingErp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const effectiveRules = useMemo<CompanyRules>(
    () => ({
      limite_monto_automatico: limit,
      presupuesto_mensual_restante: budget,
      proveedores_permitidos: providers,
      acuerdos_por_proveedor: defaultCompanyRules.acuerdos_por_proveedor,
    }),
    [budget, limit, providers],
  );

  const customProviders = useMemo(
    () => providers.filter((p) => !PRESET_PROVIDERS.includes(p)),
    [providers],
  );

  // Validación en tiempo real: el motor evalúa muestras con las reglas vigentes.
  const livePreview = useMemo(
    () =>
      LIVE_PREVIEW_SAMPLES.map((sample) => {
        const base = deterministicExtract(sample.rawText);
        const invoice = finalizeDeterministicExtraction(base, effectiveRules);
        const decision = evaluateInvoice(invoice, effectiveRules, [], [], [], () =>
          new Date("2026-01-01T00:00:00.000Z"),
        );
        return { label: sample.label, decision };
      }),
    [effectiveRules],
  );

  const sourceLabel = SOURCES.find((s) => s.id === source)?.label ?? "Fuente";

  function pushInvoices(invoices: Invoice[], sourceName: string) {
    const rows: DemoResult[] = invoices.map((invoice) => ({
      id: `${invoice.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      invoice,
      decision: evaluateInvoice(invoice, effectiveRules, [], [], [], () =>
        new Date("2026-01-01T00:00:00.000Z"),
      ),
      source: sourceName,
      humanAction: null,
    }));
    setResults((prev) => [...rows.reverse(), ...prev]);
  }

  function addProvider() {
    const name = newProvider.trim();
    if (!name) return;
    setProviders((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNewProvider("");
  }

  function togglePreset(name: string) {
    setProviders((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  function removeCustom(name: string) {
    setProviders((prev) => prev.filter((p) => p !== name));
  }

  async function connectSource() {
    setConnecting(true);
    try {
      await wait(800);
      setConnected(true);
      const base = deterministicExtract(sampleRawInvoices[0].rawText);
      pushInvoices([finalizeDeterministicExtraction(base, effectiveRules)], sourceLabel);
    } finally {
      setConnecting(false);
    }
  }

  async function linkEmail() {
    setEmailLinking(true);
    try {
      await wait(800);
      setEmailLinked(true);
      setConnected(true);
    } finally {
      setEmailLinking(false);
    }
  }

  async function syncErp() {
    setSyncingErp(true);
    try {
      await wait(700);
      setErpSynced(new Date().toLocaleTimeString());
    } finally {
      setSyncingErp(false);
    }
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const invoices: Invoice[] = [];
      for (const file of files) {
        try {
          const buffer = new Uint8Array(await file.arrayBuffer());
          const { invoice } = await ingestFile(buffer, file.name || "factura");
          invoices.push(invoice);
        } catch {
          // Un archivo ilegible no detiene el resto del lote.
        }
      }
      if (invoices.length > 0) pushInvoices(invoices, "Archivo");
      else setErrors((prev) => ({ ...prev, global: "No se pudo procesar ningún archivo." }));
    } finally {
      setBusy(false);
    }
  }

  async function processBatch() {
    setBusy(true);
    try {
      await wait(700);
      const invoices = sampleRawInvoices
        .slice(0, 6)
        .map((s) => finalizeDeterministicExtraction(deterministicExtract(s.rawText), effectiveRules));
      pushInvoices(invoices, sourceLabel);
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

  const escaladas = results.filter((r) => r.decision.estado === "ESCALAR" && r.humanAction === null);

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Indicador de pasos */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {([1, 2, 3, 4] as const).map((n, i) => (
          <div key={n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToStep(n)}
              className={`flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-300 ${
                step === n
                  ? "bg-zinc-100 text-zinc-950"
                  : step > n
                    ? "border border-zinc-600 text-zinc-300"
                    : "border border-zinc-700 text-zinc-600"
              }`}
            >
              {step > n ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
              <span className="hidden sm:inline">{STEP_LABELS[i]}</span>
            </button>
            {n < 4 && <span className="h-px w-5 bg-zinc-700 sm:w-8" />}
          </div>
        ))}
      </div>

      <div key={step} className="animate-fade-slide">
        {/* Paso 1 — Fuente de datos */}
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
              disabled={connecting}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200 disabled:opacity-60"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sincronizando catálogos…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Conectar y sincronizar
                </>
              )}
            </button>

            {connected && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
                <RefreshCw className="h-3.5 w-3.5" />
                Conectado a {sourceLabel}. Catálogo sincronizado.
              </p>
            )}

            {source === "correo" && (
              <button
                type="button"
                onClick={() => void linkEmail()}
                disabled={emailLinking || emailLinked}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-60"
              >
                {emailLinking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Vinculando bandeja…
                  </>
                ) : emailLinked ? (
                  <>
                    <Link2 className="h-4 w-4 text-emerald-400" />
                    Correo vinculado (IMAP / Google Workspace)
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Conectar correo (IMAP / Google Workspace)
                  </>
                )}
              </button>
            )}

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

        {/* Paso 2 — Reglas dinámicas + whitelist */}
        {step === 2 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Criterios y proveedores</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Reglas que el motor aplicará, retroalimentadas desde {sourceLabel}.
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
                  <label className="text-sm text-zinc-400">Umbral de aprobación automática</label>
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

            {/* Whitelist de proveedores */}
            <div className="mt-6 border-t border-zinc-800 pt-5">
              <div className="mb-2 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-zinc-400" />
                <label className="text-sm text-zinc-400">Proveedores autorizados</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_PROVIDERS.map((p) => {
                  const active = providers.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePreset(p)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                        active
                          ? "bg-zinc-100 text-zinc-950"
                          : "border border-zinc-700 bg-zinc-900 text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {active ? "✓ " : "+ "}
                      {p}
                    </button>
                  );
                })}
                {customProviders.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950"
                  >
                    {p}
                    <button
                      type="button"
                      onClick={() => removeCustom(p)}
                      aria-label={`Quitar ${p}`}
                      className="text-zinc-500 hover:text-zinc-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addProvider();
                  }}
                  placeholder="Añadir proveedor…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addProvider}
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <Plus className="h-4 w-4" />
                  Añadir
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                La whitelist se refleja al instante en los veredictos del motor.
              </p>
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

        {/* Paso 3 — Ingesta semiautomática */}
        {step === 3 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Ingesta</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Carga facturas arrastrando archivos, desde un lote o capturando un recibo.
            </p>

            {busy && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando con IA (DeepSeek)…
              </div>
            )}

            {/* Zona de arrastre */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void processFiles(Array.from(e.dataTransfer.files ?? []));
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-all duration-200 ${
                dragging
                  ? "border-zinc-400 bg-zinc-800/50"
                  : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"
              }`}
            >
              <Upload className="h-6 w-6 text-zinc-400" />
              <span className="text-sm text-zinc-300">Arrastra archivos aquí</span>
              <span className="text-xs text-zinc-600">PDF · imagen · CSV · correo</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) void processFiles(files);
                e.target.value = "";
              }}
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void processBatch()}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                Lote CSV / ERP
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                Cámara
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void processFiles([file]);
                e.target.value = "";
              }}
            />

            {errors.global && <p className="mt-3 text-xs text-amber-400">{errors.global}</p>}

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
                onClick={() => goToStep(4)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200"
              >
                Ver auditoría
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </IOSGlassCard>
        )}

        {/* Paso 4 — Auditoría y veredicto */}
        {step === 4 && (
          <IOSGlassCard className="p-6 sm:p-8">
            <h2 className="text-lg font-medium text-zinc-100">Auditoría y veredicto</h2>
            <p className="mt-1 text-xs text-zinc-500">
              El motor evalúa cada factura con control determinista.
            </p>

            {/* Validación en tiempo real */}
            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
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

            {/* Registro de ingesta */}
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-medium text-zinc-300">Registro de ingesta</h3>
              </div>

              {results.length === 0 ? (
                <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-sm text-zinc-500">
                  Aún sin facturas. Conecta una fuente e ingiere documentos.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {results.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-zinc-400">{r.invoice.id}</span>
                          <p className="truncate text-sm text-zinc-200">
                            {r.invoice.emisor} · $
                            {r.invoice.monto_usd ?? r.invoice.monto}
                          </p>
                        </div>
                        <IOSStatusBadge estado={r.decision.estado} />
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{r.decision.razon}</p>

                      {r.decision.three_way_match && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(
                            [
                              ["Proveedor", r.decision.three_way_match.vendor_match],
                              ["Acuerdo", r.decision.three_way_match.agreement_match],
                              ["Liquidez", r.decision.three_way_match.budget_liquidity_match],
                            ] as const
                          ).map(([label, ok]) => (
                            <span
                              key={label}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                ok
                                  ? "bg-zinc-800 text-zinc-300"
                                  : "border border-zinc-700 text-zinc-500"
                              }`}
                            >
                              {ok ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <X className="h-3 w-3 text-zinc-500" />
                              )}
                              {label}
                            </span>
                          ))}
                        </div>
                      )}

                      {r.decision.traza_evaluacion && r.decision.traza_evaluacion.length > 0 && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                            Traza de validación
                          </summary>
                          <ul className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 font-mono text-[10px] leading-relaxed text-zinc-500">
                            {r.decision.traza_evaluacion.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {r.decision.estado === "ESCALAR" && r.humanAction === null && (
                        <div className="mt-3 border-t border-zinc-800 pt-3">
                          <textarea
                            value={justifications[r.id] ?? ""}
                            onChange={(e) =>
                              setJustifications((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            rows={2}
                            placeholder="Nota de justificación (mín. 10 caracteres)"
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                          />
                          {errors[r.id] && (
                            <p className="mt-1 text-[11px] text-amber-400">{errors[r.id]}</p>
                          )}
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
                  {escaladas.length} excepción{escaladas.length === 1 ? "" : "es"} pendiente
                  {escaladas.length === 1 ? "" : "s"} de supervisión.
                </p>
              )}
            </div>

            {/* Exportación y sincronización ERP */}
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Cierre del caso
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportCsv(results)}
                  disabled={results.length === 0}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportJson(results)}
                  disabled={results.length === 0}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </button>
                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={results.length === 0}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-800 disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  PDF de auditoría
                </button>
                <button
                  type="button"
                  onClick={() => void syncErp()}
                  disabled={results.length === 0 || syncingErp}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-xs font-semibold text-zinc-950 transition-all duration-200 hover:bg-zinc-200 disabled:opacity-40"
                >
                  {syncingErp ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sincronizando…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Sincronizar con ERP
                    </>
                  )}
                </button>
              </div>
              {erpSynced && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Estado sincronizado con {sourceLabel} ({erpSynced}).
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 transition-all duration-200 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </button>
              <button
                type="button"
                onClick={() => {
                  setResults([]);
                  setJustifications({});
                  setErrors({});
                  setConnected(false);
                  setEmailLinked(false);
                  setErpSynced(null);
                  goToStep(1);
                }}
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

function downloadBlob(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(results: DemoResult[]) {
  const header = [
    "invoice_id",
    "emisor",
    "monto_usd",
    "moneda",
    "estado",
    "regla_disparada",
    "razon",
    "vendor_match",
    "agreement_match",
    "budget_match",
  ];
  const rows = results.map((r) => {
    const m = r.decision.three_way_match;
    return [
      r.invoice.id,
      r.invoice.emisor,
      r.invoice.monto_usd ?? r.invoice.monto,
      r.invoice.moneda,
      r.decision.estado,
      r.decision.regla_disparada,
      r.decision.razon,
      m ? m.vendor_match : "",
      m ? m.agreement_match : "",
      m ? m.budget_liquidity_match : "",
    ]
      .map(csvCell)
      .join(",");
  });
  downloadBlob(
    "jippay-auditoria.csv",
    [header.map(csvCell).join(","), ...rows].join("\n"),
    "text/csv;charset=utf-8",
  );
}

function exportJson(results: DemoResult[]) {
  const payload = results.map((r) => ({
    invoice: r.invoice,
    decision: r.decision,
    humanAction: r.humanAction,
    justification: r.justification,
  }));
  downloadBlob(
    "jippay-auditoria.json",
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function exportPdf() {
  window.print();
}