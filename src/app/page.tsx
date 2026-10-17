"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Gavel,
  Landmark,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { evaluateInvoice } from "@/lib/engine";
import { defaultCompanyRules } from "@/lib/mock-data";
import type { AgentDecision, Invoice } from "@/lib/schemas";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";
import { IOSStatusBadge } from "@/components/ui/IOSStatusBadge";

const SIM_REFERENCE_DATE = new Date("2026-01-01T00:00:00.000Z");

const SIMULATED_PROVIDERS = [
  "DevCorp",
  "LatamDesign",
  "CloudHost",
  "AndesConsulting",
  "DevC0rp",
  "HackerLabs",
];

const BENTO = [
  {
    icon: BrainCircuit,
    title: "Neuro-Symbolic AI",
    description:
      "La IA lee como un humano y estructura el caos; el código decide como un contador, sin alucinaciones.",
  },
  {
    icon: Landmark,
    title: "Conector ERP / Multi-DB",
    description:
      "Sincroniza Odoo, SAP, QuickBooks y CSV. Persistencia en disco local, Postgres/Supabase o memoria edge.",
  },
  {
    icon: ShieldCheck,
    title: "Seguridad Anti-Spoofing",
    description:
      "Levenshtein contra homógrafos, SHA-256 de archivo y huellas compuestas para frenar suplantaciones.",
  },
  {
    icon: Gavel,
    title: "Conciliación Automática",
    description:
      "Exporta el libro contable a CSV/JSON con hash de auditoría, regla disparada y razón explicable.",
  },
];

export default function Home() {
  const [monto, setMonto] = useState(450);
  const [proveedor, setProveedor] = useState("DevCorp");

  const decision = useMemo<AgentDecision>(() => {
    const invoice: Invoice = {
      id: "SIM-001",
      emisor: proveedor,
      monto,
      moneda: "USD",
      fecha_vencimiento: "2026-12-15",
      concepto: "Factura simulada desde el pitch",
    };
    return evaluateInvoice(invoice, defaultCompanyRules, [], [], [], () => SIM_REFERENCE_DATE);
  }, [monto, proveedor]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      {/* Hero estilo Apple Keynote */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Agente Neuro-Simbólico AP
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-6xl">
          Jippay.
        </h1>
        <p className="mt-2 text-xl font-light text-zinc-400 sm:text-2xl">
          Lee con IA. Decide con Código.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-500">
          Automatiza tus cuentas por pagar sin perder el control: la lectura es
          probabilística, la auditoría es determinista y cada pago queda explicado.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-100 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Configurar Reglas
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/terminal"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-6 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            Auditar Facturas
            <Terminal className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Simulador interactivo instantáneo */}
      <IOSGlassCard className="mx-auto mt-16 max-w-3xl p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-zinc-100">Simulador Determinista</h2>
            <p className="text-xs text-zinc-500">
              Mueve el monto o cambia el proveedor y observa la decisión en 0 ms.
            </p>
          </div>
          {decision ? (
            <IOSStatusBadge estado={decision.estado} />
          ) : (
            <span className="h-6 w-20 rounded-full bg-zinc-800" />
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Monto de la factura</span>
              <span className="font-mono font-semibold text-zinc-100">${monto.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={200}
              max={7000}
              step={50}
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
              className="w-full accent-zinc-300"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
              <span>$200</span>
              <span>$1,400</span>
              <span>$7,000</span>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm text-zinc-400">Proveedor</span>
            <div className="flex flex-wrap gap-2">
              {SIMULATED_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProveedor(p)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    proveedor === p
                      ? "bg-zinc-100 text-zinc-950"
                      : "border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Veredicto en vivo
            </span>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {decision?.razon ?? "Calculando veredicto…"}
            </p>
          </div>
        </div>
      </IOSGlassCard>

      {/* Cómo las reglas moldean el contexto del agente */}
      <section className="mt-16">
        <h2 className="mb-2 text-center text-xl font-medium text-zinc-100">
          Cómo las Reglas Moldean el Contexto del Agente
        </h2>
        <p className="mx-auto mb-6 max-w-2xl text-center text-sm text-zinc-400">
          Antes de llegar al motor matemático, el catálogo de proveedores, los acuerdos y los
          límites se inyectan al extractor como contexto vivo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <IOSGlassCard className="p-5">
            <span className="font-mono text-[10px] uppercase text-zinc-500">Reglas de /admin</span>
            <p className="mt-2 text-xs text-zinc-300">
              Whitelist · acuerdos_por_proveedor · límite automático · presupuesto restante
            </p>
          </IOSGlassCard>
          <IOSGlassCard className="p-5">
            <span className="font-mono text-[10px] uppercase text-zinc-500">Dominio 1</span>
            <p className="mt-2 text-xs text-zinc-300">
              Agente extractor contextual (DeepSeek) que lee el documento contra el catálogo ERP.
            </p>
          </IOSGlassCard>
          <IOSGlassCard className="p-5">
            <span className="font-mono text-[10px] uppercase text-zinc-500">Dominio 2</span>
            <p className="mt-2 text-xs text-zinc-300">
              Guardián determinista de 6 reglas que firma el veredicto ACCP / PDNG / RJCT.
            </p>
          </IOSGlassCard>
        </div>
      </section>

      {/* Bento Grid arquitectónico */}
      <section className="mt-16">
        <h2 className="mb-6 text-center text-xl font-medium text-zinc-100">
          Arquitectura Neuro-Simbólica
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BENTO.map((item) => (
            <IOSGlassCard key={item.title} className="p-6">
              <item.icon className="h-6 w-6 text-zinc-400" />
              <h3 className="mt-3 font-medium text-zinc-100">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.description}</p>
            </IOSGlassCard>
          ))}
        </div>
      </section>

      {/* Cita pitch */}
      <section className="mt-12 rounded-3xl border border-white/[0.06] bg-zinc-900/40 p-6 text-center">
        <p className="text-sm font-medium italic text-zinc-200">
          “Usamos la IA para leer como un humano, pero usamos código estricto para auditar
          como un contador.”
        </p>
      </section>
    </div>
  );
}
