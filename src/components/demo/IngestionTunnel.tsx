"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { evaluateInvoice } from "@/lib/engine";
import { deterministicExtract, finalizeDeterministicExtraction } from "@/lib/extractor";
import { sha256Hex } from "@/lib/security";
import { useStore } from "@/lib/store";
import { IOSStatusBadge } from "@/components/ui/IOSStatusBadge";
import type { AgentDecision, Invoice } from "@/lib/schemas";

type Tunnel = "whatsapp" | "email" | "erp";
type Path = "A" | "B";

const TUNNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "email", label: "Email IMAP", icon: Mail },
  { id: "erp", label: "ERP Sync", icon: Database },
] as const;

const RAW_TEXT: Record<Path, string> = {
  A: "Factura INV-204 de DevCorp por 450 USD, vence 2026-11-15, concepto: desarrollo de software",
  B: "Factura INV-777 de DevC0rp por 450 USD, vence 2026-11-15, concepto: servicios de desarrollo",
};

export function IngestionTunnel() {
  const { rules } = useStore();
  const [tunnel, setTunnel] = useState<Tunnel>("whatsapp");
  const [path, setPath] = useState<Path>("A");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Invoice | null>(null);
  const [decision, setDecision] = useState<AgentDecision | null>(null);

  // Extrae e inyecta en el motor determinista (transición 500ms).
  async function extractAndInject() {
    setExtracting(true);
    setExtracted(null);
    setDecision(null);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const base = deterministicExtract(RAW_TEXT[path]);
    const invoice = finalizeDeterministicExtraction(base, rules);
    const verdict = evaluateInvoice(invoice, rules, [], [], [], () =>
      new Date("2026-01-01T00:00:00.000Z"),
    );
    setExtracted(invoice);
    setDecision(verdict);
    setExtracting(false);
  }

  const fileHash = useMemo(() => sha256Hex(RAW_TEXT[path]).slice(0, 16), [path]);

  return (
    <div className="overflow-x-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-4 backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">Túneles de ingesta en vivo</h3>
          <p className="mt-1 text-xs text-zinc-500">
            El documento entra crudo desde el canal y se inyecta al motor determinista.
          </p>
        </div>

        {/* Selector de camino A/B */}
        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => {
              setPath("A");
              setExtracted(null);
              setDecision(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              path === "A" ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-500"
            }`}
          >
            Camino A · Limpia
          </button>
          <button
            type="button"
            onClick={() => {
              setPath("B");
              setExtracted(null);
              setDecision(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              path === "B" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500"
            }`}
          >
            Camino B · Riesgo
          </button>
        </div>
      </div>

      {/* Selector de túnel */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {TUNNELS.map((t) => {
          const Icon = t.icon;
          const active = tunnel === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTunnel(t.id);
                setExtracted(null);
                setDecision(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                active
                  ? "border-zinc-500 bg-zinc-900 text-zinc-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Mockup del canal */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        {tunnel === "whatsapp" && (
          <WhatsAppMockup path={path} onExtract={() => void extractAndInject()} extracting={extracting} />
        )}
        {tunnel === "email" && (
          <EmailMockup path={path} onExtract={() => void extractAndInject()} extracting={extracting} />
        )}
        {tunnel === "erp" && (
          <ErpMockup path={path} onExtract={() => void extractAndInject()} extracting={extracting} />
        )}
      </div>

      {/* Botón de extracción */}
      <button
        type="button"
        onClick={() => void extractAndInject()}
        disabled={extracting}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
      >
        {extracting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Extrayendo e inyectando…
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Extraer e Inyectar al Motor Determinista
          </>
        )}
      </button>

      {/* Resultado estructurado */}
      {extracted && decision && (
        <div className="animate-fade-slide mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Campos extraídos
            </span>
            <IOSStatusBadge estado={decision.estado} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div>
              <span className="block text-zinc-600">Emisor</span>
              <span className="font-mono text-zinc-200">{extracted.emisor}</span>
            </div>
            <div>
              <span className="block text-zinc-600">Monto</span>
              <span className="font-mono text-zinc-200">
                ${extracted.monto_usd ?? extracted.monto}
              </span>
            </div>
            <div>
              <span className="block text-zinc-600">ID Comercial</span>
              <span className="font-mono text-zinc-200">{extracted.id}</span>
            </div>
            <div>
              <span className="block text-zinc-600">Hash SHA-256</span>
              <span className="font-mono text-zinc-400">{fileHash}…</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-zinc-500">{decision.razon}</p>
        </div>
      )}
    </div>
  );
}

function WhatsAppMockup({ path, onExtract, extracting }: { path: Path; onExtract: () => void; extracting: boolean }) {
  const good = path === "A";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
        {good ? "+58 412-555-0192 · Global Tech C.A." : "+1 555-000-1234 · ProveedorDesconocido"}
      </div>
      <div className={`max-w-[85%] rounded-2xl rounded-tl-sm p-3 text-xs ${
        good ? "bg-zinc-900 text-zinc-200" : "bg-amber-950/40 text-amber-100"
      }`}>
        {good
          ? "Hola equipo, adjunto factura correspondiente a la OC-2026-889 por $450.00"
          : "Les reenvío esta factura INV-204 que parece ya registrada. ¿La confirman?"}
      </div>
      <button
        type="button"
        onClick={onExtract}
        disabled={extracting}
        className="flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left transition-colors hover:border-zinc-600 disabled:opacity-60"
      >
        <FileText className="h-4 w-4 text-zinc-500" />
        <span className="font-mono text-[11px] text-zinc-300">
          {good ? "INV-204.pdf (148 KB)" : "INV-204_DUPLICADO.pdf (148 KB)"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-400">
          {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {extracting ? "escaneando" : "webhook"}
        </span>
      </button>
    </div>
  );
}

function EmailMockup({ path, onExtract, extracting }: { path: Path; onExtract: () => void; extracting: boolean }) {
  const good = path === "A";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>De: {good ? "facturacion@devcorp.io" : "facturacion@hackerlabs.io"}</span>
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="h-3 w-3" />
          DKIM/SPF
        </span>
      </div>
      <div className="text-[11px] text-zinc-500">Para: invoices@tuempresa.jippay.us</div>
      <div className="text-xs text-zinc-300">
        {good ? "Asunto: Factura INV-204 · Servicios de desarrollo" : "Asunto: RE: Factura duplicada"}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExtract}
          disabled={extracting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[10px] text-zinc-300 transition-colors hover:border-zinc-600 disabled:opacity-60"
        >
          <FileText className="h-3.5 w-3.5" />
          Factura_Fiscal_094.pdf
          {extracting && <Loader2 className="h-3 w-3 animate-spin" />}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
          <FileText className="h-3.5 w-3.5" />
          XML_SENIAT_DIAN.xml
        </span>
      </div>
    </div>
  );
}

function ErpMockup({ path, onExtract, extracting }: { path: Path; onExtract: () => void; extracting: boolean }) {
  const good = path === "A";
  const payload = good
    ? `{ "invoice_id": "INV-204", "vendor": "DevCorp", "amount": 450.00, "po_ref": "PO-889" }`
    : `{ "invoice_id": "INV-777", "vendor": "DevC0rp", "amount": 450.00, "po_ref": null }`;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
        <Database className="h-3.5 w-3.5 text-emerald-400" />
        Webhook de sincronización (Odoo / a2 / QuickBooks)
      </div>
      <button
        type="button"
        onClick={onExtract}
        disabled={extracting}
        className="w-full text-left transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 font-mono text-[10px] leading-5 text-zinc-300">
          {payload}
        </pre>
      </button>
    </div>
  );
}
