"use client";

import type { AgentDecision } from "@/lib/schemas";
import { BrainCircuit, FileText, Fingerprint, ShieldCheck, X } from "lucide-react";
import { IOSStatusBadge } from "./IOSStatusBadge";

interface IOSSlideDrawerProps {
  open: boolean;
  onClose: () => void;
  decision: AgentDecision;
  rawText?: string;
  systemPrompt?: string;
}

export function IOSSlideDrawer({ open, onClose, decision, rawText, systemPrompt }: IOSSlideDrawerProps) {
  if (!open) return null;

  const factura = decision.factura;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
              Inspector Forense
            </span>
            <h3 className="mt-1 text-xl font-semibold text-zinc-100">{decision.invoice_id}</h3>
          </div>
          <div className="flex items-center gap-2">
            <IOSStatusBadge estado={decision.estado} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-400 transition-colors hover:text-zinc-100"
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Documento original */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                Documento Original
              </span>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-400">
              {rawText ?? "(no disponible)"}
            </pre>
          </section>

          {/* JSON extraído */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                JSON Extraído (Zod)
              </span>
            </div>
            <pre className="max-h-48 overflow-auto font-mono text-xs text-zinc-300">
              {factura ? JSON.stringify(factura, null, 2) : "(sin factura)"}
            </pre>
          </section>

          {/* Hash SHA-256 */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                Hash SHA-256
              </span>
            </div>
            <div className="break-all font-mono text-xs text-zinc-400">
              <span className="text-zinc-600">archivo: </span>
              {factura?.fileHash ?? "—"}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-zinc-400">
              <span className="text-zinc-600">auditoría: </span>
              {decision.hash_auditoria ?? "—"}
            </div>
          </section>

          {/* Traza determinista */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                Traza Determinista
              </span>
            </div>
            <ol className="space-y-1.5">
              {decision.traza_evaluacion.map((paso, index) => (
                <li key={index} className="font-mono text-xs text-zinc-400">
                  <span className="mr-2 text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
                  {paso}
                </li>
              ))}
            </ol>
          </section>

          {/* Cerebro del Agente & Contexto Inyectado */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                Cerebro del Agente & Contexto Inyectado
              </span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-400">
              <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1">
                [Dominio 1: Agente Extractor Contextual]
              </span>
              <span className="text-zinc-600">→</span>
              <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1">
                [Dominio 2: Guardia Determinista (6 Reglas)]
              </span>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="block font-mono text-[10px] uppercase text-zinc-500">
                  Motor de extracción
                </span>
                <span className="font-mono text-xs text-zinc-200">
                  {factura?.extraction_engine === "deepseek-llm"
                    ? "DeepSeek LLM"
                    : "Deterministic Fallback"}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <span className="block font-mono text-[10px] uppercase text-zinc-500">
                  Confidence score
                </span>
                <span className="font-mono text-xs text-zinc-200">
                  {factura?.confidence_score != null ? `${factura.confidence_score}/100` : "—"}
                </span>
              </div>
            </div>

            <div className="mb-3">
              <span className="mb-1 block font-mono text-[10px] uppercase text-zinc-500">
                agent_reasoning
              </span>
              <p className="text-xs leading-relaxed text-zinc-300">
                {factura?.agent_reasoning ?? "—"}
              </p>
            </div>

            <div>
              <span className="mb-1 block font-mono text-[10px] uppercase text-zinc-500">
                System Prompt inyectado (desde reglas de /admin)
              </span>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                {factura?.system_prompt_preview ?? systemPrompt ?? "(no disponible)"}
              </pre>
            </div>
          </section>

          {/* 3-Way Match & ISO 20022 */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                3-Way Match & ISO 20022
              </span>
            </div>
            {decision.three_way_match ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {[
                  { ok: decision.three_way_match.vendor_match, label: "Proveedor ERP" },
                  { ok: decision.three_way_match.agreement_match, label: "Acuerdo SLA" },
                  {
                    ok: decision.three_way_match.budget_liquidity_match,
                    label: "Liquidez & FX",
                  },
                ].map((item) => (
                  <span
                    key={item.label}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.ok
                        ? "bg-emerald-950 text-emerald-300"
                        : "bg-zinc-900 text-zinc-500 line-through"
                    }`}
                  >
                    {item.ok ? "✓" : "✗"} {item.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Sin datos de cruce contable.</p>
            )}
            <div className="font-mono text-xs text-zinc-400">
              <span className="text-zinc-600">ISO 20022: </span>
              {decision.iso20022_status ?? "—"}
            </div>
            {(decision.approved_by || decision.approval_note) && (
              <div className="mt-2 border-t border-zinc-800 pt-2 font-mono text-xs text-zinc-400">
                {decision.approved_by && (
                  <div>
                    <span className="text-zinc-600">approved_by: </span>
                    {decision.approved_by}
                  </div>
                )}
                {decision.approval_note && (
                  <div className="mt-1">
                    <span className="text-zinc-600">nota: </span>
                    {decision.approval_note}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Razón */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              Razón Explicable
            </span>
            <p className="mt-2 text-sm leading-relaxed text-zinc-200">{decision.razon}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
