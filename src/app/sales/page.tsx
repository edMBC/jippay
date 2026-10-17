"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Landmark, ScrollText, ShieldCheck, Zap } from "lucide-react";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";

const PLANS = [
  {
    name: "Seed",
    price: "$499",
    cadence: "/mes",
    features: ["Hasta 200 facturas/mes", "Motor determinista + DeepSeek", "Exportación CSV/JSON", "1 rol SOX"],
  },
  {
    name: "Growth LATAM",
    price: "$1,499",
    cadence: "/mes",
    features: ["Hasta 1,500 facturas/mes", "3-Way Match ERP (Odoo/SAP/QB)", "Multi-DB + ledger SHA-256", "RBAC SOX completo"],
  },
  {
    name: "Enterprise Custom",
    price: "Custom",
    cadence: "",
    features: ["Volúmenes ilimitados", "ISO 20022 & SOC 2", "Supabase / ERP on-prem", "SLA + auditoría dedicada"],
  },
];

const MATRIX = [
  {
    icon: Landmark,
    title: "3-Way Match ERP",
    description: "Cruza factura vs maestro de proveedores, acuerdo SLA y liquidez presupuestaria antes de autorizar.",
  },
  {
    icon: ScrollText,
    title: "ISO 20022 & ISO 4217 FX",
    description: "Veredictos ACCP/PDNG/RJCT y normalización multimoneda congelada al instante de evaluación.",
  },
  {
    icon: Zap,
    title: "ISO/IEC 42001 (Gobernanza IA)",
    description: "El contexto de reglas se inyecta al agente; el guardián determinista nunca delega la decisión.",
  },
  {
    icon: ShieldCheck,
    title: "Segregación de Funciones SOX",
    description: "CFO configura, Controller aprueba y Auditor inspecciona en solo lectura. Sin colisión de roles.",
  },
];

export default function SalesPage() {
  const [monthlyInvoices, setMonthlyInvoices] = useState(200);
  const [minutesPerInvoice, setMinutesPerInvoice] = useState(15);
  const [hourlyCost, setHourlyCost] = useState(25);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [plan, setPlan] = useState("Growth LATAM");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const hoursSavedYear = useMemo(
    () => (monthlyInvoices * minutesPerInvoice * 12) / 60,
    [monthlyInvoices, minutesPerInvoice],
  );
  const savingsYear = useMemo(
    () => hoursSavedYear * hourlyCost,
    [hoursSavedYear, hourlyCost],
  );

  const submitLead = async () => {
    try {
      const response = await fetch("/api/sales-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company,
          plan,
          monthlyInvoices,
          message,
        }),
      });
      if (response.ok) {
        setSent(true);
        setName("");
        setEmail("");
        setCompany("");
        setMessage("");
      }
    } catch {
      // No bloquea la demo.
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <div className="mb-10 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Enterprise & ROI
        </span>
        <h1 className="mt-1 text-4xl font-semibold text-zinc-100">
          El CFO que nunca duerme
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
          Cumplimiento ISO/SOX y triple cruce contable, con una IA gobernada por reglas
          que nunca aprueba fuera de política.
        </p>
      </div>

      {/* Calculadora ROI */}
      <IOSGlassCard className="mb-8 p-6 sm:p-8">
        <h2 className="text-lg font-medium text-zinc-100">Calculadora de ROI en tiempo real</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Ajusta tu operación y observa el impacto anual de automatizar cuentas por pagar.
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Facturas mensuales</span>
              <span className="font-mono font-semibold text-zinc-100">{monthlyInvoices}</span>
            </div>
            <input
              type="range"
              min={20}
              max={2000}
              step={20}
              value={monthlyInvoices}
              onChange={(e) => setMonthlyInvoices(Number(e.target.value))}
              className="w-full accent-zinc-300"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Minutos manuales por factura</span>
              <span className="font-mono font-semibold text-zinc-100">{minutesPerInvoice} min</span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={minutesPerInvoice}
              onChange={(e) => setMinutesPerInvoice(Number(e.target.value))}
              className="w-full accent-zinc-300"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Costo hora del equipo (USD)</span>
              <span className="font-mono font-semibold text-zinc-100">${hourlyCost}</span>
            </div>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={hourlyCost}
              onChange={(e) => setHourlyCost(Number(e.target.value))}
              className="w-full accent-zinc-300"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="font-mono text-[11px] uppercase text-zinc-500">Horas ahorradas/año</span>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-100">
              {hoursSavedYear.toLocaleString()} h
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="font-mono text-[11px] uppercase text-zinc-500">Ahorro financiero</span>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-100">
              ${savingsYear.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="font-mono text-[11px] uppercase text-zinc-500">Pagos fuera de política</span>
            <p className="mt-1 font-mono text-2xl font-semibold text-emerald-400">-100%</p>
          </div>
        </div>
      </IOSGlassCard>

      {/* Matriz de estándares */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MATRIX.map((item) => (
          <IOSGlassCard key={item.title} className="p-6">
            <item.icon className="h-6 w-6 text-zinc-400" />
            <h3 className="mt-3 font-medium text-zinc-100">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.description}</p>
          </IOSGlassCard>
        ))}
      </div>

      {/* Planes */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((p) => (
          <IOSGlassCard key={p.name} className="p-6">
            <span className="font-mono text-xs uppercase text-zinc-500">{p.name}</span>
            <p className="mt-2 font-mono text-3xl font-semibold text-zinc-100">
              {p.price}
              <span className="text-base text-zinc-500">{p.cadence}</span>
            </p>
            <ul className="mt-4 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  {f}
                </li>
              ))}
            </ul>
          </IOSGlassCard>
        ))}
      </div>

      {/* Formulario demo */}
      <IOSGlassCard className="p-6 sm:p-8">
        <h2 className="text-lg font-medium text-zinc-100">Agenda una demo</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Un arquitecto de soluciones te mostrará el flujo completo con tu propio ERP.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
            Gracias. Recibimos tu solicitud y te contactaremos pronto.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email corporativo"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Empresa"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
            >
              {PLANS.map((p) => (
                <option key={p.name} value={p.name} className="bg-zinc-900">
                  {p.name}
                </option>
              ))}
            </select>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensaje (opcional)"
              className="h-24 resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none sm:col-span-2"
            />
            <button
              type="button"
              onClick={() => void submitLead()}
              disabled={!name || !email || !company}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-40 sm:col-span-2"
            >
              Solicitar demo
            </button>
          </div>
        )}
      </IOSGlassCard>
    </div>
  );
}
