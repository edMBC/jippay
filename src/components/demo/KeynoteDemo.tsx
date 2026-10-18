"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Database,
  Gavel,
  Mail,
  MessageCircle,
  Play,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { evaluateInvoice } from "@/lib/engine";
import { deterministicExtract, finalizeDeterministicExtraction } from "@/lib/extractor";
import type { CompanyRules } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import { IOSStatusBadge } from "@/components/ui/IOSStatusBadge";
import { AuditList } from "@/components/demo/AuditList";

/**
 * Keynote escénica del demo: una secuencia cinemática autoejecutable que
 * demuestra el motor determinista en vivo. Usa `evaluateInvoice` real; no hay
 * veredictos estáticos. Cada factura se extrae y evalúa con las reglas vigentes.
 */

/** Canales de ingesta unificados (Inbox Multicanal), sin cards duplicadas. */
const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "email", label: "Email IMAP", icon: Mail },
  { id: "odoo", label: "Odoo", icon: Database },
  { id: "quickbooks", label: "QuickBooks", icon: Database },
  { id: "a2", label: "a2 ERP", icon: Database },
  { id: "erp", label: "ERP Sync", icon: Database },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];

/** Raw data entrante por canal: lo que Jippay lee sin intervención humana. */
const RAW_PAYLOADS: Record<ChannelId, string> = {
  whatsapp: '{ "from": "+58412...", "attachment": "invoice.pdf", "type": "image/pdf" }',
  email: "Subject: OC-2026-889 · Attachments: 1 PDF (INV-204.pdf)",
  odoo: '{ "invoice_id": "INV-204", "vendor": "DevCorp", "amount": 450.00, "po_ref": "PO-889" }',
  quickbooks: '{ "txn_id": "INV-204", "payee": "DevCorp", "total": 450.00, "account": "AP" }',
  a2: '{ "documento": "INV-204", "proveedor": "DevCorp", "monto": 450.00, "asiento": "A-1042" }',
  erp: '{ "source": "odoo/a2/qb", "event": "invoice.created", "invoice_id": "INV-204", "po_ref": "PO-889" }',
};

type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STAGE_MS: Record<Exclude<Stage, 0>, number> = {
  1: 1800,
  2: 1600,
  3: 1200,
  4: 1600,
  5: 1600,
  6: 1200,
  7: 1800,
  8: 0,
};

const GOOD_RAW =
  "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software";
const BAD_RAW =
  "Factura INV-777 de DevC0rp por 450 USD, vence 2026-11-15, concepto: servicios de desarrollo";

export function KeynoteDemo() {
  const { rules, updateRules } = useStore();
  const [stage, setStage] = useState<Stage>(0);
  const [playing, setPlaying] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelId | null>(null);
  const [whatIf, setWhatIf] = useState({
    budgetDrop: false,
    removeProvider: false,
    lowerThreshold: false,
  });

  // Avance automático de la secuencia cinemática.
  useEffect(() => {
    if (!playing) return;
    if (stage >= 8) return;
    const ms = STAGE_MS[(stage + 1) as Exclude<Stage, 0>];
    const timer = window.setTimeout(() => setStage((s) => (s < 8 ? (s + 1) as Stage : s)), ms);
    return () => window.clearTimeout(timer);
  }, [playing, stage]);

  const start = () => {
    setStage(1);
    setPlaying(true);
  };

  const reset = () => {
    setPlaying(false);
    setStage(0);
    setSelectedChannel(null);
    setWhatIf({ budgetDrop: false, removeProvider: false, lowerThreshold: false });
  };

  // Facturas reales evaluadas por el motor.
  const good = useMemo(() => {
    const invoice = finalizeDeterministicExtraction(deterministicExtract(GOOD_RAW), rules);
    const decision = evaluateInvoice(invoice, rules, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return { invoice, decision };
  }, [rules]);

  const bad = useMemo(() => {
    const invoice = finalizeDeterministicExtraction(deterministicExtract(BAD_RAW), rules);
    const decision = evaluateInvoice(invoice, rules, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return { invoice, decision };
  }, [rules]);

  // Módulo What-If: reevalúa la factura buena alterando las reglas en caliente.
  const whatIfResult = useMemo(() => {
    const invoice = good.invoice;
    const monto = invoice.monto_usd ?? invoice.monto ?? 450;
    const altered: CompanyRules = {
      ...rules,
      presupuesto_mensual_restante: whatIf.budgetDrop
        ? Math.max(0, monto - 1)
        : rules.presupuesto_mensual_restante,
      proveedores_permitidos: whatIf.removeProvider
        ? rules.proveedores_permitidos.filter(
            (p) => p.toLowerCase() !== invoice.emisor.toLowerCase(),
          )
        : rules.proveedores_permitidos,
      limite_monto_automatico: whatIf.lowerThreshold
        ? Math.max(0, monto - 1)
        : rules.limite_monto_automatico,
    };
    const decision = evaluateInvoice(invoice, altered, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return { invoice, decision, monto, altered };
  }, [rules, whatIf, good.invoice]);

  const activeChanges: string[] = [];
  if (whatIf.budgetDrop) {
    activeChanges.push(
      `Presupuesto insuficiente: faltan $${(
        whatIfResult.monto - whatIfResult.altered.presupuesto_mensual_restante
      ).toFixed(2)}.`,
    );
  }
  if (whatIf.removeProvider) {
    activeChanges.push(`Proveedor "${whatIfResult.invoice.emisor}" excluido de la lista blanca.`);
  }
  if (whatIf.lowerThreshold) {
    activeChanges.push(
      `Umbral automático rebajado por debajo del monto ($${whatIfResult.altered.limite_monto_automatico}).`,
    );
  }

  // Canal resaltado durante la secuencia automática (avanza por los 6 canales).
  const autoChannel =
    stage >= 2
      ? CHANNELS[Math.min(stage - 2, CHANNELS.length - 1)]
      : null;

  // La selección manual del usuario manda; si no hay, se usa la secuencia auto.
  const activeChannel = selectedChannel
    ? CHANNELS.find((c) => c.id === selectedChannel) ?? null
    : autoChannel;

  return (
    <div className="mx-auto w-full max-w-5xl overflow-x-hidden px-4 py-8 sm:px-8 sm:py-10">
      {/* Estado idle: botón de arranque cinematográfico */}
      {stage === 0 && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] font-medium text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Keynote interactiva · 30 segundos
          </span>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
            Mira al agente decidir, <span className="text-emerald-400">en vivo</span>.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-500">
            Una factura limpia contra una factura trampa. El motor determinista las cruza,
            las valida y emite el veredicto sin intervención humana.
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-8 text-sm font-semibold text-zinc-950 transition-all duration-300 hover:bg-white hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]"
          >
            <Play className="h-4 w-4" />
            Iniciar la keynote
          </button>
        </div>
      )}

      {stage > 0 && (
        <div className="space-y-6">
          {/* Inbox Multicanal unificado: tabs + raw data (sin cards duplicadas) */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-md sm:p-6">
            <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  Inbox Multicanal
                </span>
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[10px] font-semibold text-zinc-950">
                  6
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
                {playing && stage < 8 ? "capturando…" : "zero-touch"}
              </span>
            </div>

            {/* Barra de pestañas horizontal (scroll en móvil) */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                const active = activeChannel?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedChannel(c.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                      active
                        ? "border-zinc-500 bg-zinc-900 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {c.label}
                  </button>
                );
              })}
            </div>

            {/* RAW DATA ENTRANTE del canal activo */}
            {activeChannel && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = activeChannel.icon;
                    return <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
                  })()}
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {activeChannel.label} · raw data entrante
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-emerald-400/80">
                  {RAW_PAYLOADS[activeChannel.id]}
                </pre>
              </div>
            )}
          </div>

          {/* Duelo de los dos caminos */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Camino A */}
            <div
              className={`rounded-2xl border p-5 transition-all duration-300 ${
                stage >= 3
                  ? "border-emerald-900/60 bg-emerald-950/20"
                  : "border-zinc-800 bg-zinc-950"
              } ${stage === 5 ? "animate-glow-emerald" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-emerald-300">Camino A · Factura limpia</span>
                {stage >= 5 && <IOSStatusBadge estado={good.decision.estado} />}
              </div>

              {stage >= 3 ? (
                <div className="mt-3 animate-slide-in-left">
                  <p className="font-mono text-[11px] text-zinc-400">
                    {good.invoice.id} · {good.invoice.emisor} · $
                    {good.invoice.monto_usd ?? good.invoice.monto}
                  </p>
                  {stage >= 4 && (
                    <div className="mt-3 space-y-1.5 text-[11px] text-zinc-400">
                      <ValidationStep label="3-Way Match (PO · recibo · factura)" done={stage >= 4} />
                      <ValidationStep label="Proveedor en lista blanca" done={stage >= 4} />
                      <ValidationStep label="Presupuesto disponible" done={stage >= 4} />
                      <ValidationStep label="Confianza > 75%" done={stage >= 4} />
                    </div>
                  )}
                  {stage >= 5 && (
                    <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                      {good.decision.razon}
                    </p>
                  )}
                  {stage >= 5 && good.decision.iso20022_status && (
                    <p className="mt-2 font-mono text-[10px] text-emerald-300">
                      ISO 20022: {good.decision.iso20022_status}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-600">Esperando factura…</p>
              )}
            </div>

            {/* Camino B */}
            <div
              className={`rounded-2xl border p-5 transition-all duration-300 ${
                stage >= 6
                  ? "border-amber-900/60 bg-amber-950/20"
                  : "border-zinc-800 bg-zinc-950"
              } ${stage === 7 ? "animate-flash-amber" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-amber-300">Camino B · Factura trampa</span>
                {stage >= 7 && <IOSStatusBadge estado={bad.decision.estado} />}
              </div>

              {stage >= 6 ? (
                <div className="mt-3 animate-slide-in-right">
                  <p className="font-mono text-[11px] text-zinc-400">
                    {bad.invoice.id} · {bad.invoice.emisor} · ${bad.invoice.monto_usd ?? bad.invoice.monto}
                  </p>
                  {stage >= 7 && (
                    <>
                      <p className="mt-3 font-mono text-[11px] text-amber-300">
                        {bad.decision.regla_disparada}
                      </p>
                      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                        {bad.decision.razon}
                      </p>
                      <p className="mt-3 text-[10px] leading-4 text-zinc-600">
                        Operación detenida a la espera de justificación humana (control SOX).
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-600">Esperando factura…</p>
              )}
            </div>
          </div>

          {/* Cierre de auditoría: lista densa de registros procesados */}
          <AuditList />

          {/* Pie: motor determinista + controles + What-If */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-zinc-400" />
                <span className="text-xs text-zinc-400">La IA extrae</span>
                <span className="text-zinc-700">→</span>
                <Gavel className="h-4 w-4 text-zinc-400" />
                <span className="text-xs text-zinc-400">El motor decide</span>
              </div>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reiniciar
              </button>
            </div>

            {/* Panel de control rápido (presupuesto + whitelist) */}
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-800 pt-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Presupuesto corporativo</span>
                  <span className="font-mono text-xs text-zinc-100">
                    ${rules.presupuesto_mensual_restante.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={20000}
                  step={100}
                  value={rules.presupuesto_mensual_restante}
                  onChange={(e) =>
                    updateRules({ presupuesto_mensual_restante: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-400"
                />
              </div>

              <div>
                <span className="mb-2 block text-xs text-zinc-400">Whitelist de proveedores</span>
                <div className="flex flex-wrap gap-1.5">
                  {["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"].map((p) => {
                    const active = rules.proveedores_permitidos.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          updateRules({
                            proveedores_permitidos: active
                              ? rules.proveedores_permitidos.filter((x) => x !== p)
                              : [...rules.proveedores_permitidos, p],
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                          active
                            ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40"
                            : "border border-zinc-700 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* What-If */}
            <div className="mt-4 border-t border-zinc-800 pt-4">
              <p className="text-sm font-medium text-zinc-200">¿Qué pasa si cambian las condiciones?</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["budgetDrop", "Caída drástica de presupuesto"],
                    ["removeProvider", "Excluir proveedor de la whitelist"],
                    ["lowerThreshold", "Bajar umbral automático"],
                  ] as const
                ).map(([key, label]) => {
                  const checked = whatIf[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setWhatIf((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-[11px] transition-all duration-200 ${
                        checked
                          ? "border-zinc-500 bg-zinc-900 text-zinc-100"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      <span>{label}</span>
                      <span
                        className={`flex h-4 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                          checked ? "bg-zinc-200" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`h-3 w-3 rounded-full bg-zinc-950 transition-transform ${
                            checked ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={`mt-3 rounded-lg border p-3 transition-all duration-300 ${
                  activeChanges.length === 0
                    ? "border-emerald-900/50 bg-emerald-950/30"
                    : whatIfResult.decision.estado === "FRENAR"
                      ? "border-red-900/50 bg-red-950/20"
                      : "border-amber-900/50 bg-amber-950/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-300">
                    Factura base · {whatIfResult.invoice.emisor} ${whatIfResult.monto}
                  </span>
                  <IOSStatusBadge estado={whatIfResult.decision.estado} />
                </div>
                {activeChanges.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {activeChanges.map((c) => (
                      <li key={c} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-emerald-300">{whatIfResult.decision.razon}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ValidationStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-700" />
      )}
      <span className={done ? "text-zinc-300" : "text-zinc-600"}>{label}</span>
    </div>
  );
}
