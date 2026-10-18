"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  Gavel,
  Home,
  Inbox,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { evaluateInvoice } from "@/lib/engine";
import { deterministicExtract, finalizeDeterministicExtraction } from "@/lib/extractor";
import { useStore } from "@/lib/store";
import { IOSStatusBadge } from "@/components/ui/IOSStatusBadge";
import { AuditKanban } from "@/components/demo/AuditKanban";

/**
 * PlatformDemo: experiencia Streamline (master-detail) que simula la plataforma
 * real. Usa `evaluateInvoice` real para el veredicto. El feed de la izquierda es
 * el "Inbox de ingesta"; el panel derecho muestra extracción + pipeline.
 */

type ItemId = "whatsapp" | "email" | "erp";

interface InboxItem {
  id: ItemId;
  kind: "whatsapp" | "email" | "erp";
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof MessageCircle;
}

const ITEMS: InboxItem[] = [
  {
    id: "whatsapp",
    kind: "whatsapp",
    title: "Global Tech · WhatsApp",
    subtitle: "Factura del mes adjunta",
    badge: "PDF",
    icon: MessageCircle,
  },
  {
    id: "email",
    kind: "email",
    title: "facturacion@globaltech.com",
    subtitle: "OC-2026-889",
    badge: "XML",
    icon: Mail,
  },
  {
    id: "erp",
    kind: "erp",
    title: "Odoo · Sincronización",
    subtitle: "Asiento contable + PO",
    badge: "JSON",
    icon: Database,
  },
];

// Texto crudo por canal para la extracción determinista (mismo motor).
const RAW: Record<ItemId, { A: string; B: string }> = {
  whatsapp: {
    A: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software",
    B: "Factura INV-777 de DevC0rp por 450 USD, vence 2026-11-15, concepto: servicios de desarrollo",
  },
  email: {
    A: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software",
    B: "Factura INV-777 de DevC0rp por 450 USD, vence 2026-11-15, concepto: servicios de desarrollo",
  },
  erp: {
    A: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software",
    B: "Factura INV-777 de DevC0rp por 450 USD, vence 2026-11-15, concepto: servicios de desarrollo",
  },
};

const NAV: {
  label: string;
  icon: typeof Home;
  view: "inbox" | "aprobaciones" | null;
  highlight?: "inbox" | "aprobaciones";
  badge?: number;
}[] = [
  { label: "Dashboard", icon: Home, view: "inbox" },
  { label: "Inbox Multicanal", icon: Inbox, view: "inbox", highlight: "inbox", badge: 3 },
  { label: "Aprobaciones", icon: ShieldCheck, view: "aprobaciones", highlight: "aprobaciones" },
  { label: "Reglas SOX", icon: Gavel, view: null },
];

export function PlatformDemo() {
  const { rules } = useStore();
  const [activeId, setActiveId] = useState<ItemId>("whatsapp");
  const [path, setPath] = useState<"A" | "B">("A");
  const [phase, setPhase] = useState<"idle" | "extracting" | "done">("idle");
  const [view, setView] = useState<"inbox" | "aprobaciones">("inbox");

  const active = ITEMS.find((i) => i.id === activeId) ?? ITEMS[0];

  const result = useMemo(() => {
    const invoice = finalizeDeterministicExtraction(
      deterministicExtract(RAW[activeId][path]),
      rules,
    );
    const decision = evaluateInvoice(invoice, rules, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return { invoice, decision };
  }, [activeId, path, rules]);

  const selectItem = (id: ItemId) => {
    setActiveId(id);
    setPhase("idle");
  };

  const run = () => {
    setPhase("extracting");
    window.setTimeout(() => setPhase("done"), 600);
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar izquierdo (fijo) */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-zinc-800/80 px-5">
          <span className="text-lg font-bold tracking-tight text-zinc-100">
            Jippay<span className="text-zinc-500">.</span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.highlight === view;
            const isDisabled = item.view === null;
            return (
              <button
                key={item.label}
                type="button"
                disabled={isDisabled}
                onClick={() => item.view && setView(item.view)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-zinc-100"
                    : isDisabled
                      ? "cursor-default text-zinc-600"
                      : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[10px] font-semibold text-zinc-950">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-zinc-800/80 p-4">
          <p className="text-[11px] leading-4 text-zinc-600">
            Jippay · agente de pago inteligente
          </p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2 text-sm">
            {view === "aprobaciones" ? (
              <>
                <span className="text-zinc-500">Aprobaciones</span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                <span className="font-medium text-zinc-200">
                  Cierre de Auditoría SOX
                </span>
              </>
            ) : (
              <>
                <span className="text-zinc-500">Inbox</span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                <span className="font-medium text-zinc-200">
                  Facturas Pendientes
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-500 md:flex">
              <Search className="h-3.5 w-3.5" />
              Buscar…
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/50 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
              Modo: Live Demo
            </span>
          </div>
        </header>

        {view === "aprobaciones" ? (
          <AuditKanban />
        ) : (
          <>
        {/* Split view */}
        <div className="flex min-h-0 flex-1">
          {/* Panel maestro (40%) */}
          <div className="w-[38%] min-w-[260px] border-r border-zinc-800/80 p-3">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Bell className="h-4 w-4 text-zinc-500" />
              <h2 className="text-sm font-medium text-zinc-200">Inbox de ingesta</h2>
            </div>
            <div className="space-y-2">
              {ITEMS.map((item) => {
                const Icon = item.icon;
                const activeState = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition-all duration-200 ${
                      activeState
                        ? "border-zinc-500 bg-zinc-900"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 shrink-0 ${activeState ? "text-zinc-200" : "text-zinc-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-200">{item.title}</p>
                        <p className="truncate text-[11px] text-zinc-500">{item.subtitle}</p>
                      </div>
                      <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                        {item.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel detalle / motor (60%) */}
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-medium text-zinc-200">Pipeline Determinista</h2>
              </div>
              {/* Toggle camino A/B */}
              <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setPath("A");
                    setPhase("idle");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    path === "A" ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-500"
                  }`}
                >
                  Limpia
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPath("B");
                    setPhase("idle");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    path === "B" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500"
                  }`}
                >
                  Riesgo
                </button>
              </div>
            </div>

            {/* Documento crudo */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
                <active.icon className="h-3.5 w-3.5" />
                {active.title}
              </div>
              <p className="text-xs leading-5 text-zinc-300">{active.subtitle}</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <FileText className="h-4 w-4 text-zinc-500" />
                <span className="font-mono text-[11px] text-zinc-300">
                  {active.badge === "JSON" ? "payload.json" : "INV-204.pdf (148 KB)"}
                </span>
              </div>
            </div>

            {/* Extracción / formulario inmutable */}
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Extracción
                </span>
                {phase === "extracting" && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    decodificando…
                  </span>
                )}
              </div>
              {phase === "idle" && (
                <button
                  type="button"
                  onClick={run}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Ejecutar extracción
                </button>
              )}
              {phase !== "idle" && (
                <div className={`grid grid-cols-3 gap-3 transition-opacity ${phase === "extracting" ? "opacity-40" : "opacity-100"}`}>
                  <Field label="Monto" value={`$${result.invoice.monto_usd ?? result.invoice.monto}`} />
                  <Field label="Emisor" value={result.invoice.emisor} />
                  <Field label="ID Comercial" value={result.invoice.id} />
                </div>
              )}
            </div>

            {/* Evaluación + veredicto */}
            {phase === "done" && (
              <div className="animate-fade-slide mt-4 flex-1">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-xl">
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Validaciones
                  </span>
                  <div className="mt-3 space-y-2">
                    <ValidationRow
                      label="3-Way Match (PO · factura · recepción)"
                      ok={Boolean(result.decision.three_way_match?.vendor_match && result.decision.three_way_match.agreement_match && result.decision.three_way_match.budget_liquidity_match)}
                    />
                    <ValidationRow
                      label="Proveedor en lista blanca"
                      ok={Boolean(result.decision.three_way_match?.vendor_match)}
                    />
                    <ValidationRow
                      label="Presupuesto disponible"
                      ok={Boolean(result.decision.three_way_match?.budget_liquidity_match)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Barra de acción sticky */}
        {phase === "done" && (
          <div className="sticky bottom-0 border-t border-zinc-800/80 bg-zinc-950/90 p-4 backdrop-blur-xl">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <IOSStatusBadge estado={result.decision.estado} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-zinc-500">{result.decision.razon}</p>
              </div>
              {result.decision.estado === "PAGAR" ? (
                <span className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-emerald-500/15 px-5 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
                  <CheckCircle2 className="h-4 w-4" />
                  PAGO AUTORIZADO (ISO 20022)
                </span>
              ) : (
                <span className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-amber-500/15 px-5 text-sm font-semibold text-amber-300 ring-1 ring-amber-500/40">
                  <XCircle className="h-4 w-4" />
                  RETENIDO: REQUIERE JUSTIFICACIÓN SOX
                </span>
              )}
              <button
                type="button"
                onClick={() => setView("aprobaciones")}
                className="inline-flex h-12 shrink-0 items-center gap-1 rounded-xl border border-zinc-800 px-3 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              >
                Cierre SOX
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="block text-[10px] text-zinc-600">{label}</span>
      <span className="font-mono text-xs text-zinc-200">{value}</span>
    </div>
  );
}

function ValidationRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-amber-400" />
      )}
      <span className={ok ? "text-zinc-300" : "text-zinc-500"}>{label}</span>
    </div>
  );
}
