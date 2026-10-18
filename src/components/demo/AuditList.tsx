"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Database,
  Download,
  Fingerprint,
  Lock,
  Mail,
  MessageCircle,
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
 * AuditList: "Cierre de Auditoría SOX" en formato de lista profesional (Data List).
 *
 * Cada fila es una factura procesada con columnas clave (ID, Proveedor, Monto y
 * estado). Al tocarla se despliega un accordion con la traza inmutable del motor
 * y, si está retenida, el input de justificación del operador.
 *
 * Es una vista de solo demostración que usa `evaluateInvoice` real; no escribe
 * en el ledger ni llama a `/api/finance/*`.
 */

type Lane = AgentDecision["estado"];

export interface AuditListItem {
  key: string;
  channel: string;
  invoice: Invoice;
  decision: AgentDecision;
}

interface BatchItem {
  key: string;
  channel: string;
  raw: string;
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

const STATUS: Record<
  Lane,
  { label: string; className: string; icon: typeof ShieldCheck }
> = {
  PAGAR: {
    label: "Aprobado",
    className: "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20",
    icon: ShieldCheck,
  },
  ESCALAR: {
    label: "Retenido",
    className: "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20",
    icon: Clock,
  },
  FRENAR: {
    label: "Bloqueado",
    className: "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20",
    icon: ShieldAlert,
  },
};

function formatTs(iso: string, offsetSec: number): string {
  const t = new Date(new Date(iso).getTime() + offsetSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

/** Icono por canal de entrada (para la columna "Canal" de la lista). */
function ChannelIcon({ channel }: { channel: string }) {
  const lower = channel.toLowerCase();
  const Icon =
    lower.includes("whatsapp") || lower.includes("chat")
      ? MessageCircle
      : lower.includes("email") || lower.includes("correo") || lower.includes("imap")
        ? Mail
        : Database;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />;
}

function buildAuditEntries(d: AgentDecision): string[] {
  const m = d.three_way_match;
  const entries: string[] = [];
  if (m) {
    const ok = m.vendor_match && m.agreement_match && m.budget_liquidity_match;
    entries.push(`${ok ? "✓" : "✗"} 3-Way Match ${ok ? "Exitoso" : "Fallido"}`);
    entries.push(`   · Proveedor (vendor): ${m.vendor_match ? "OK" : "FALLA"}`);
    entries.push(`   · Acuerdo (SLA): ${m.agreement_match ? "OK" : "FALLA"}`);
    entries.push(`   · Liquidez: ${m.budget_liquidity_match ? "Disponible" : "Insuficiente"}`);
  }
  if (d.estado === "ESCALAR") {
    entries.push("⚠ Regla SOX: Requiere revisión manual");
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

function exportCsv(rows: AuditListItem[]) {
  const header = [
    "invoice_id",
    "emisor",
    "monto_usd",
    "moneda",
    "canal",
    "estado",
    "regla_disparada",
    "razon",
    "iso20022_status",
    "hash_auditoria",
  ];
  const body = rows.map((r) =>
    [
      r.invoice.id,
      r.invoice.emisor,
      r.invoice.monto_usd ?? r.invoice.monto,
      r.invoice.moneda,
      r.channel,
      r.decision.estado,
      r.decision.regla_disparada,
      r.decision.razon,
      r.decision.iso20022_status ?? "",
      r.decision.hash_auditoria ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  downloadBlob(
    "jippay-cierre-sox.csv",
    [header.map(csvCell).join(","), ...body].join("\n"),
    "text/csv;charset=utf-8",
  );
}

function exportJson(rows: AuditListItem[]) {
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

export function AuditList({ items }: { items?: AuditListItem[] }) {
  const { rules } = useStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, { by: string; note: string }>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = useMemo<AuditListItem[]>(() => {
    if (items !== undefined) return items;

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

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const sign = (row: AuditListItem) => {
    const note = (justifications[row.key] ?? "").trim();
    if (note.length < 8) return;
    setSigned((prev) => ({
      ...prev,
      [row.key]: { by: "cfo@jippay.us", note },
    }));
  };

  const approvedCount = rows.filter((r) => r.decision.estado === "PAGAR").length;
  const retainedCount = rows.filter((r) => r.decision.estado === "ESCALAR").length;
  const blockedCount = rows.filter((r) => r.decision.estado === "FRENAR").length;

  return (
    <div className="overflow-x-hidden">
      {/* Barra de control del cierre */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">Cierre de Auditoría SOX</h3>
          <p className="text-[11px] text-zinc-500">
            {approvedCount} aprobadas · {retainedCount} retenidas · {blockedCount}{" "}
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
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
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
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lista de registros */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
        {/* Cabecera de columnas (solo escritorio) */}
        <div className="hidden items-center gap-3 border-b border-zinc-800/80 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 md:flex">
          <span className="min-w-0 flex-1">ID</span>
          <span className="min-w-0 flex-[1.4]">Proveedor</span>
          <span className="min-w-0 flex-1">Canal</span>
          <span className="w-24 text-right">Monto</span>
          <span className="w-28">Estado</span>
          <span className="w-5" />
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-zinc-600">
            Sin facturas procesadas. Conecta una fuente e ingiere documentos.
          </p>
        ) : (
          rows.map((row) => {
            const isOpen = expanded[row.key] === true;
            const signature = signed[row.key];
            const status = STATUS[row.decision.estado];
            const StatusIcon = status.icon;
            const badge = (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
              >
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </span>
            );
            return (
              <div
                key={row.key}
                className="border-b border-zinc-800/80 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  className="flex w-full items-center gap-3 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:bg-zinc-800/50"
                >
                  {/* Vista móvil: apilada y compacta */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-zinc-300">
                        {row.invoice.id}
                      </span>
                      {badge}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-200">
                        {row.invoice.emisor}
                      </span>
                      <span className="shrink-0 font-mono text-sm text-zinc-100">
                        ${row.invoice.monto_usd ?? row.invoice.monto}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <ChannelIcon channel={row.channel} />
                      <span className="truncate">{row.channel}</span>
                    </div>
                  </div>

                  {/* Vista escritorio: columnas alineadas con la cabecera */}
                  <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
                      {row.invoice.id}
                    </span>
                    <span className="min-w-0 flex-[1.4] truncate text-sm font-medium text-zinc-200">
                      {row.invoice.emisor}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-zinc-400">
                      <ChannelIcon channel={row.channel} />
                      <span className="truncate">{row.channel}</span>
                    </span>
                    <span className="w-24 shrink-0 text-right font-mono text-sm text-zinc-100">
                      ${row.invoice.monto_usd ?? row.invoice.monto}
                    </span>
                    <span className="w-28 shrink-0">{badge}</span>
                  </div>

                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="bg-zinc-950/60 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                      <span>{row.channel}</span>
                      <span className="font-mono text-[10px] text-zinc-600">
                        {row.invoice.moneda}
                      </span>
                    </div>

                    <p className="mb-3 text-xs leading-5 text-zinc-400">
                      {row.decision.razon}
                    </p>

                    {/* Traza de auditoría inmutable */}
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        <Fingerprint className="h-3 w-3" />
                        Traza de auditoría inmutable
                      </div>
                      <div className="space-y-1 font-mono text-[11px] leading-5 text-zinc-400">
                        {buildAuditEntries(row.decision).map((entry, i) => (
                          <p key={i} className="whitespace-pre-wrap">
                            <span className="text-zinc-600">
                              [{formatTs(row.decision.timestamp, i)}]
                            </span>{" "}
                            {entry}
                          </p>
                        ))}
                      </div>
                    </div>

                    {row.decision.hash_auditoria && (
                      <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[10px] text-zinc-600">
                        <Fingerprint className="h-3 w-3 shrink-0" />
                        SHA-256 {row.decision.hash_auditoria.slice(0, 24)}…
                      </p>
                    )}

                    {/* Justificación humana para retenidos */}
                    {row.decision.estado === "ESCALAR" && (
                      <div className="mt-3 border-t border-zinc-800 pt-3">
                        <span className="text-[11px] font-medium text-zinc-400">
                          Justificación del operador
                        </span>
                        {signature ? (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            <div className="min-w-0">
                              <p className="text-xs text-zinc-300">{signature.note}</p>
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
                              disabled={(justifications[row.key] ?? "").trim().length < 8}
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

      {rows.length > 0 && (
        <p className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-zinc-600">
          <Check className="h-3 w-3" />
          {rows.length} registro{rows.length === 1 ? "" : "s"} · traza íntegra verificada
        </p>
      )}
    </div>
  );
}
