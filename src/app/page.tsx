import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Gavel,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

const STEPS = [
  {
    icon: SlidersHorizontal,
    title: "Configura tu criterio",
    body: "Presupuesto, límite automático y proveedores autorizados. La política del CFO se vuelve la frontera del agente.",
  },
  {
    icon: FileText,
    title: "Ingiere a escala",
    body: "CSV de ERP (Odoo/QuickBooks), PDFs, fotos de recibos y correos corporativos, normalizados en un solo flujo.",
  },
  {
    icon: CheckCircle2,
    title: "Supervisa excepciones",
    body: "Veredicto PAGAR · ESCALAR · FRENAR. Cuando una excepción lo exige, un humano firma la decisión con justificación.",
  },
] as const;

const TRUST = ["ISO 20022", "3-Way Match ERP", "SOX RBAC"] as const;

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Agente neuro-simbólico de cuentas por pagar
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl lg:text-6xl">
          La IA lee. El código decide. Tú descansas.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-500 sm:text-lg">
          Jippay extrae, valida y resuelve tus facturas bajo reglas corporativas
          inmutables, con supervisión humana exactamente donde importa.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/demo"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 sm:w-auto"
          >
            Probar la demo
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-6 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 sm:w-auto"
          >
            Acceso
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {TRUST.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={step.title}
              className="rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-6"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-zinc-400" />
                <span className="font-mono text-xs text-zinc-600">0{i + 1}</span>
              </div>
              <h2 className="mt-4 text-sm font-medium text-zinc-100">{step.title}</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{step.body}</p>
            </div>
          );
        })}
      </section>

      {/* Separación neuro-simbólica */}
      <section className="mx-auto mt-20 max-w-2xl text-center">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <BrainCircuit className="h-4 w-4" />
            La IA extrae e interpreta
          </span>
          <span className="text-zinc-700">→</span>
          <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
            <Gavel className="h-4 w-4" />
            El motor determinista decide
          </span>
        </div>
        <p className="mx-auto mt-4 max-w-md text-xs leading-5 text-zinc-600">
          La IA nunca autoriza pagos ni modifica presupuestos. Los veredictos
          nacen de reglas deterministas y quedan auditados.
        </p>
      </section>
    </div>
  );
}