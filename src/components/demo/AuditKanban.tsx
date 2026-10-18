"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Download,
  Fingerprint,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { evaluateInvoice } from "@/lib/engine";
import {
  deterministicExtract,
  finalizeDeterministicExtraction,
} from "@/lib/extractor";
import { useStore } from "@/lib/store";
import type { AgentDecision, Invoice } from "@/lib/schemas";

/**
 * AuditKanban: "Cierre de Auditoría SOX" en formato de tablero de liquidación.
 *
 * Es una vista de solo demostración que usa el motor determinista real
 * (`evaluateInvoice`) sobre un lote fijo de canales (WhatsApp / Email / ERP).
 * No escribe en el ledger ni llama a `/api/finance/*`: es una vitrina del
 * veredicto del motor, no la terminal productiva.
 */

type Lane = AgentDecision["estado"];

interface BatchItem {
  key: string;
  channel: "WhatsApp" | "Email IMAP" | "Odoo ERP";
  raw: string;
}

export interface AuditKanbanItem {
  key: string;
  channel: string;
  invoice: Invoice;
  decision: AgentDecision;
}

const BATCH: BatchItem[] = [
  {
    key: "wa-1",
    channel: "WhatsApp",
    raw: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software",
  },
  {
    key: "imap-1",
    channel: "Email IMAP",
    raw: "Factura INV-710 de AndesConsulting por 300 USD, vence 2026-11-05, concepto: consultoría de procesos",
  },
  {
    key: "erp-1",
    channel: "Odoo ERP",
    raw: "Factura INV-301 de LatamDesign por 1850 USD, vence 2026-12-01, concepto: rediseño de identidad",
  },
  {
    key: "imap-2",
    channel: "Email IMAP",
    raw: "Factura INV-208 de DevCorp por 950 USD, vence 2026-11-10, concepto: soporte extendido",
  },
  {
    key: "wa-2",
    channel: "WhatsApp",
    raw: "Factura INV-999 de HackerLabs por 300 USD, vence 2026-11-20, concepto: auditoría de penetración",
  },
  {
    key: "wa-3",
    channel: "WhatsApp",
    raw: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software (cobro repetido)",
  },
];

const LANES: {
  lane: Lane;
  title: string;
  subtitle: string;
  icon: typeof ShieldCheck;
  dot: string;
  badge: string;
}[] = [
  {
    lane: "PAGAR",
    title: "Aprobado",
    subtitle: "PAGAR",
    icon: ShieldCheck,
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20",
  },
  {
    lane: "ESCALAR",
    title: "Revisión SOX",
    subtitle: "ESCALADO",
    icon: Clock,
    dot: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20",
  },
  {
    lane: "FRENAR",
    title: "Rechazado",
    subtitle: "BLOQUEADO",
    icon: ShieldAlert,
    dot: "bg-rose-400",
    badge: "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20",
  },
];

function formatTs(iso: string, offsetSec: number): string {
  const t = new Date(new Date(iso).getTime() + offsetSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

function buildAuditEntries(d: AgentDecision): string[] {
  const m = d.three_way_match;
  const entries: string[] = [];
  if (m) {
    const ok = m.vendor_match && m.agreement_match && m.budget_liquidity_match;
    entries.push(`3-Way Match: ${ok ? "OK" : "FALLA"}`);
    entries.push(`  Proveedor (vendor): ${m.vendor_match ? "OK" : "FALLA"}`);
    entries.push(`  Acuerdo (agreement): ${m.agreement_match ? "OK" : "FALLA"}`);
    entries.push(`  Presupuesto (liquidez): ${m.budget_liquidity_match ? "Disponible" : "Insuficiente"}`);
  }
  entries.push(`Veredicto: ${d.estado} (ISO 20022: ${d.iso20022_status ?? "-"})`);
  entries.push(`Regla disparada: ${d.regla_disparada}`);
  entries.push(...d.traza_evaluacion);
  return entries;
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

function exportCsv(rows: AuditKanbanItem[]) {
  const header = [
    "invoice_id",
    "emisor",
    "monto_usd",
    "moneda",
    "canal",
    "estado",
    "regla_disparada",
    "razon",
    "vendor_match",
    "agreement_match",
    "budget_match",
    "iso20022_status",
    "hash_auditoria",
  ];
  const body = rows.map((r) => {
    const m = r.decision.three_way_match;
    return [
      r.invoice.id,
      r.invoice.emisor,
      r.invoice.monto_usd ?? r.invoice.monto,
      r.invoice.moneda,
      r.channel,
      r.decision.estado,
      r.decision.regla_disparada,
      r.decision.razon,
      m ? m.vendor_match : "",
      m ? m.agreement_match : "",
      m ? m.budget_liquidity_match : "",
      r.decision.iso20022_status ?? "",
      r.decision.hash_auditoria ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  downloadBlob(
    "jippay-cierre-sox.csv",
    [header.map(csvCell).join(","), ...body].join("\n"),
    "text/csv;charset=utf-8",
  );
}

function exportJson(rows: AuditKanbanItem[]) {
  const payload = rows.map((r) => ({
    invoice: r.invoice,
    channel: r.channel,
    decision: r.decision,
  }));
  downloadBlob(
    "jippay-cierre-sox.json",
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function exportPdf() {
  window.print();
}

export function AuditKanban({ items }: { items?: AuditKanbanItem[] }) {
  const { rules } = useStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, { by: string; note: string }>>({});
  const [liquidated, setLiquidated] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = useMemo<AuditKanbanItem[]>(() => {
    // Si el llamador aporta ítems ya evaluados, se usan tal cual (permite que el
    // wizard del demo alimente el tablero con sus propios resultados).
    if (items !== undefined) return items;

    // Vitrina autónoma: lote fijo multicanal procesado secuencialmente por el
    // motor real para que el duplicado se frene de forma determinista.
    const processedIds: string[] = [];
    return BATCH.map((item) => {
      const invoice = finalizeDeterministicExtraction(
        deterministicExtract(item.raw),
        rules,
      );
      const decision = evaluateInvoice(
        invoice,
        rules,
        processedIds,
        [],
        [],
        () => new Date("2026-10-17T14:14:00.000Z"),
      );
      processedIds.push(invoice.id);
      return { key: item.key, channel: item.channel, invoice, decision };
    });
  }, [items, rules]);

  const columns = useMemo(
    () =>
      LANES.map((lane) => ({
        ...lane,
        items: rows.filter((r) => r.decision.estado === lane.lane),
      })),
    [rows],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const sign = (row: AuditKanbanItem) => {
    const note = (justifications[row.key] ?? "").trim();
    if (note.length < 8) return;
    setSigned((prev) => ({
      ...prev,
      [row.key]: { by: "cfo@jippay.us", note },
    }));
  };

  const liquidateApproved = () => {
    setLiquidated(columns[0].items.map((r) => r.key));
    setMenuOpen(false);
  };

  const approvedCount = columns[0].items.length;
  const soxCount = columns[1].items.length;
  const blockedCount = columns[2].items.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      {/* Barra de control del cierre */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-zinc-100">
            Cierre de Auditoría SOX
          </h1>
          <p className="text-xs text-zinc-500">
            {approvedCount} aprobadas · {soxCount} en revisión · {blockedCount}{" "}
            bloqueadas
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700"
          >
            <Download className="h-4 w-4 text-zinc-400" />
            Acciones en lote
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition-transform ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50">
                <button
                  type="button"
                  onClick={() => {
                    exportCsv(rows);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60"
                >
                  Exportar Reporte SOX (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportJson(rows);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60"
                >
                  Exportar JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportPdf();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60"
                >
                  PDF de auditoría
                </button>
                <div className="border-t border-zinc-800" />
                <button
                  type="button"
                  onClick={liquidateApproved}
                  disabled={approvedCount === 0 || liquidated.length > 0}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:text-zinc-600"
                >
                  <Check className="h-4 w-4" />
                  {liquidated.length > 0
                    ? "Lote aprobado liquidado"
                    : "Liquidar Lote Aprobado"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tablero Kanban */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => {
          const Icon = col.icon;
          return (
            <div
              key={col.lane}
              className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/40"
            >
              <div className="flex items-center gap-2 border-b border-zinc-800/70 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <Icon className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-200">
                  {col.title}
                </h2>
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${col.badge}`}
                >
                  {col.items.length}
                </span>
              </div>

              <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto p-3">
                {col.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 py-8 text-center text-xs text-zinc-600">
                    Sin ítems
                  </div>
                ) : (
                  col.items.map((row) => {
                    const isOpen = expanded[row.key] === true;
                    const signature = signed[row.key];
                    const isLiquidated = liquidated.includes(row.key);
                    return (
                      <div
                        key={row.key}
                        className="rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700"
                      >
                        <button
                          type="button"
                          onClick={() => toggle(row.key)}
                          className="flex w-full items-center gap-3 p-3 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-200">
                              {row.invoice.emisor}
                            </p>
                            <p className="truncate font-mono text-[11px] text-zinc-500">
                              {row.invoice.id}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-medium text-zinc-100">
                            ${row.invoice.monto_usd ?? row.invoice.monto}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-zinc-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>

                        {isOpen && (
                          <div className="border-t border-zinc-800 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                              <span>{row.channel}</span>
                              {isLiquidated && (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <Check className="h-3 w-3" /> Liquidado
                                </span>
                              )}
                            </div>

                            <p className="mb-3 text-xs leading-5 text-zinc-400">
                              {row.decision.razon}
                            </p>

                            {/* Traza de auditoría inmutable */}
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                                <Fingerprint className="h-3 w-3" />
                                Traza de auditoría inmutable
                              </div>
                              <div className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px] leading-5 text-zinc-400">
                                {buildAuditEntries(row.decision).map(
                                  (entry, i) => (
                                    <p key={i} className="whitespace-pre-wrap">
                                      <span className="text-zinc-600">
                                        [{formatTs(row.decision.timestamp, i)}]
                                      </span>{" "}
                                      {entry}
                                    </p>
                                  ),
                                )}
                              </div>
                            </div>

                            {row.decision.hash_auditoria && (
                              <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[10px] text-zinc-600">
                                <Fingerprint className="h-3 w-3 shrink-0" />
                                SHA-256 {row.decision.hash_auditoria.slice(0, 24)}…
                              </p>
                            )}

                            {/* Justificación humana para escalados */}
                            {row.decision.estado === "ESCALAR" && (
                              <div className="mt-3 border-t border-zinc-800 pt-3">
                                <span className="text-[11px] font-medium text-zinc-400">
                                  Justificación SOX
                                </span>
                                {signature ? (
                                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
                                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                    <div className="min-w-0">
                                      <p className="text-xs text-zinc-300">
                                        {signature.note}
                                      </p>
                                      <p className="mt-1 text-[10px] text-zinc-500">
                                        Firmado por {signature.by}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <textarea
                                      value={justifications[row.key] ?? ""}
                                      onChange={(e) =>
                                        setJustifications((prev) => ({
                                          ...prev,
                                          [row.key]: e.target.value,
                                        }))
                                      }
                                      rows={2}
                                      placeholder="Justifique por qué este pago debe proceder…"
                                      className="mt-2 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => sign(row)}
                                      disabled={
                                        (justifications[row.key] ?? "")
                                          .trim().length < 8
                                      }
                                      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                                    >
                                      <Lock className="h-3.5 w-3.5" />
                                      Firmar electrónicamente
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
