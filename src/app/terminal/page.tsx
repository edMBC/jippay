"use client";

import { Fragment, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Lock,
  Mail,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";
import { IOSSegmentedControl, type SegmentedOption } from "@/components/ui/IOSSegmentedControl";
import { IOSSlideDrawer } from "@/components/ui/IOSSlideDrawer";
import { IOSStatusBadge } from "@/components/ui/IOSStatusBadge";
import { sampleRawInvoices, type SampleCategory } from "@/lib/mock-data";
import { buildAgentSystemPrompt } from "@/lib/extractor";
import { useStore, type DecisionRecord } from "@/lib/store";
import type { AgentDecision } from "@/lib/schemas";

function ThreeWaySeal({ decision }: { decision: AgentDecision }) {
  const m = decision.three_way_match;
  if (!m) return <span className="text-xs text-zinc-600">—</span>;
  const items = [
    { ok: m.vendor_match, label: "ERP" },
    { ok: m.agreement_match, label: "SLA" },
    { ok: m.budget_liquidity_match, label: "FX" },
  ];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {items.map((item) => (
          <span
            key={item.label}
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              item.ok
                ? "bg-emerald-950 text-emerald-300"
                : "bg-zinc-900 text-zinc-500 line-through"
            }`}
          >
            {item.ok ? "✓" : "✗"} {item.label}
          </span>
        ))}
      </div>
      <span className="font-mono text-[10px] text-zinc-500">
        ISO 20022: {decision.iso20022_status ?? "—"}
      </span>
    </div>
  );
}

type Channel = "archivo" | "galeria" | "chat";
type Filter = "TODOS" | "PAGAR" | "ESCALAR" | "FRENAR";

const CHANNELS: SegmentedOption<Channel>[] = [
  { value: "archivo", label: "Archivo" },
  { value: "galeria", label: "Galería" },
  { value: "chat", label: "Correo / Chat" },
];

const FILTERS: Filter[] = ["TODOS", "PAGAR", "ESCALAR", "FRENAR"];

const CATEGORY_LABELS: Record<SampleCategory, string> = {
  normal: "Casos Normales",
  trampa: "Casos Trampa Financieros",
  seguridad: "Ataques de Seguridad",
};

const SAMPLE_FILES = [
  { name: "INV-204_DevCorp_450_USD.pdf", kind: "PDF" },
  { name: "INV-301_LatamDesign_1850_USD.png", kind: "Imagen" },
  { name: "INV-999_HackerLabs_300_USD.eml", kind: "Correo" },
  { name: "INV-405_CloudHost_6200_USD.txt", kind: "Texto" },
  { name: "INV-208_DevCorp_950_USD.pdf", kind: "PDF" },
  { name: "INV-710_AndesConsulting_1200000_COP.png", kind: "Imagen" },
  { name: "INV-512_AndesConsulting_8500_MXN.txt", kind: "Texto" },
];

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TerminalPage() {
  const {
    rules,
    decisions,
    user,
    loading,
    processText,
    processFile,
    processBatch,
    resolveEscalated,
    exportCsv,
    exportJson,
  } = useStore();

  const systemPrompt = buildAgentSystemPrompt(rules);
  const canApprove = user?.role === "CFO_ADMIN" || user?.role === "CONTROLLER_APPROVER";

  const [channel, setChannel] = useState<Channel>("galeria");
  const [manualText, setManualText] = useState("");
  const [filter, setFilter] = useState<Filter>("TODOS");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [drawerRecord, setDrawerRecord] = useState<DecisionRecord | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const filtered =
    filter === "TODOS" ? decisions : decisions.filter((d) => d.decision.estado === filter);

  const latest = decisions[0]?.decision ?? null;
  const inspected = latest?.factura ?? null;

  const runFile = async (file: File) => {
    await processFile(file);
  };

  const runSampleFile = async (name: string) => {
    const response = await fetch(`/sample-files/${name}`);
    const blob = await response.blob();
    await processFile(new File([blob], name));
  };

  const runManual = async () => {
    if (!manualText.trim()) return;
    await processText(manualText);
    setManualText("");
  };

  const toggleExpand = (record: DecisionRecord) => {
    const key = record.decision.invoice_id;
    setExpandedId((prev) => (prev === key ? null : key));
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Vista 03 · Terminal de Auditoría
        </span>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-100">Terminal Multimodal</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Ingiere PDFs, fotos, correos y CSV; audita cada decisión explicable.
        </p>
      </div>

      {/* Selector de canal */}
      <div className="mb-6 overflow-x-auto">
        <IOSSegmentedControl options={CHANNELS} value={channel} onChange={setChannel} />
      </div>

      {/* Acciones maestras */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={processBatch}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-40"
        >
          <Zap className="h-4 w-4" />
          Ejecutar Stress Test (Lote Completo)
        </button>
        <button
          onClick={() => downloadBlob(exportCsv(), "text/csv", "jippay-reconciliacion.csv")}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar .CSV
        </button>
        <button
          onClick={() => downloadBlob(exportJson(), "application/json", "jippay-reconciliacion.json")}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          <FileJson className="h-4 w-4" />
          Exportar .JSON
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bloque A: Ingesta */}
        <IOSGlassCard className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-400" />
            <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-400">
              A. Ingesta Multimodal
            </h2>
          </div>

          {channel === "archivo" && (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void runFile(file);
                }}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-zinc-400 bg-zinc-800/40" : "border-zinc-700 bg-zinc-950"
                }`}
              >
                <Upload className="h-8 w-8 text-zinc-500" />
                <p className="mt-3 text-sm text-zinc-300">
                  Arrastra un archivo aquí
                </p>
                <p className="mt-1 text-xs text-zinc-600">PDF, PNG, JPG, WebP, EML, TXT, CSV, JSON</p>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  <Upload className="h-4 w-4" />
                  Seleccionar Archivo
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  <Camera className="h-4 w-4" />
                  Usar Cámara para Foto de Recibo
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.eml,.txt,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void runFile(file);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void runFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {channel === "galeria" && (
            <div className="space-y-5">
              {(["normal", "trampa", "seguridad"] as SampleCategory[]).map((category) => (
                <div key={category}>
                  <h3 className="mb-2 text-xs font-medium text-zinc-500">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {sampleRawInvoices
                      .filter((s) => s.category === category)
                      .map((sample) => (
                        <button
                          key={sample.label}
                          onClick={() => void processText(sample.rawText)}
                          disabled={loading}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          {sample.label}
                        </button>
                      ))}
                  </div>
                </div>
              ))}

              <div>
                <h3 className="mb-2 text-xs font-medium text-zinc-500">
                  Archivos Reales (public/sample-files)
                </h3>
                <div className="flex flex-col gap-1.5">
                  {SAMPLE_FILES.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => void runSampleFile(file.name)}
                      disabled={loading}
                      className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {file.kind === "Imagen" ? (
                        <ImageIcon className="h-3.5 w-3.5 text-zinc-500" />
                      ) : file.kind === "Correo" ? (
                        <Mail className="h-3.5 w-3.5 text-zinc-500" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-zinc-500" />
                      )}
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {channel === "chat" && (
            <div>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Pega aquí un correo, mensaje de Slack o WhatsApp..."
                className="h-36 w-full resize-none rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <button
                onClick={runManual}
                disabled={loading || !manualText.trim()}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-40"
              >
                Procesar Mensaje
              </button>
            </div>
          )}
        </IOSGlassCard>

        {/* Bloque B: Inspector forense */}
        <IOSGlassCard className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-400" />
            <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-400">
              B. Previsualizador + Inspector JSON
            </h2>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] text-zinc-500">
                {inspected ? `InvoiceSchema → ${inspected.id}` : "InvoiceSchema → sin datos"}
              </span>
              {inspected?.fileHash && (
                <span className="max-w-[45%] truncate font-mono text-[10px] text-zinc-600">
                  sha256:{inspected.fileHash.slice(0, 16)}…
                </span>
              )}
            </div>
            <pre className="max-h-64 overflow-auto font-mono text-xs leading-relaxed text-zinc-300">
              {inspected
                ? JSON.stringify(inspected, null, 2)
                : "Procesa una factura para ver el JSON extraído y su hash SHA-256."}
            </pre>
          </div>
        </IOSGlassCard>
      </div>

      {/* Bloque C: Log de auditoría */}
      <IOSGlassCard className="mt-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-400" />
            <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-400">
              C. Registro Inmutable de Decisiones
            </h2>
          </div>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Factura</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">3-Way Match</th>
                <th className="px-3 py-2 font-medium">Razón</th>
                <th className="px-3 py-2 font-medium">Acción humana</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((record) => {
                const { decision } = record;
                const factura = decision.factura;
                const isExpanded = expandedId === decision.invoice_id;
                return (
                  <Fragment key={decision.invoice_id}>
                    <tr className="align-top">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-300">
                        {decision.invoice_id}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">{factura?.emisor ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                        ${factura?.monto_usd ?? factura?.monto ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        <IOSStatusBadge estado={decision.estado} />
                      </td>
                      <td className="px-3 py-2">
                        <ThreeWaySeal decision={decision} />
                      </td>
                      <td className="max-w-xs px-3 py-2 text-xs leading-relaxed text-zinc-400">
                        {decision.razon}
                      </td>
                      <td className="px-3 py-2">
                        {decision.estado === "ESCALAR" ? (
                          record.humanAction ? (
                            <span className="flex flex-col gap-0.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  record.humanAction === "APROBADO"
                                    ? "bg-zinc-100 text-zinc-950"
                                    : "bg-zinc-950 text-zinc-400"
                                }`}
                              >
                                {record.humanAction === "APROBADO" ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                                {record.humanAction}
                              </span>
                              {decision.approved_by && (
                                <span className="text-[10px] text-zinc-500">
                                  {decision.approved_by}
                                </span>
                              )}
                            </span>
                          ) : canApprove ? (
                            <span className="flex flex-col gap-1">
                              <span className="flex gap-1.5">
                                <button
                                  onClick={() =>
                                    resolveEscalated(record, "APROBADO", notes[decision.invoice_id])
                                  }
                                  className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
                                >
                                  Aprobar
                                </button>
                                <button
                                  onClick={() =>
                                    resolveEscalated(record, "RECHAZADO", notes[decision.invoice_id])
                                  }
                                  className="rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-200"
                                >
                                  Rechazar
                                </button>
                              </span>
                              <input
                                value={notes[decision.invoice_id] ?? ""}
                                onChange={(e) =>
                                  setNotes((prev) => ({
                                    ...prev,
                                    [decision.invoice_id]: e.target.value,
                                  }))
                                }
                                placeholder="Nota (opcional)"
                                className="w-36 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                              />
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                              <Lock className="h-3 w-3" /> Candado SOX
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setDrawerRecord(record)}
                          className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200"
                        >
                          Abrir
                        </button>
                        <button
                          onClick={() => toggleExpand(record)}
                          className="ml-2 text-zinc-500 transition-colors hover:text-zinc-200"
                          aria-label="Ver traza"
                        >
                          <ChevronDown
                            className={`inline h-4 w-4 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-zinc-950 px-3 py-3">
                          <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                            Traza de evaluación
                          </span>
                          <ol className="space-y-1 font-mono text-xs text-zinc-400">
                            {decision.traza_evaluacion.map((paso, index) => (
                              <li key={index}>
                                <span className="text-zinc-600">
                                  {String(index + 1).padStart(2, "0")}
                                </span>{" "}
                                {paso}
                              </li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-xs text-zinc-600">
                    Sin decisiones en el log. Procesa una factura o ejecuta el stress test.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </IOSGlassCard>

      {drawerRecord && (
        <IOSSlideDrawer
          open
          onClose={() => setDrawerRecord(null)}
          decision={drawerRecord.decision}
          rawText={drawerRecord.rawText}
          systemPrompt={systemPrompt}
        />
      )}
    </div>
  );
}
