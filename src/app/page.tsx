import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Database,
  Gavel,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Wallet,
} from "lucide-react";

const CORE_VALIDATIONS = [
  {
    icon: UserCheck,
    title: "Proveedor autorizado",
    body: "Identidad verificada contra la whitelist y anti-spoofing.",
  },
  {
    icon: Wallet,
    title: "Monto acordado",
    body: "El importe cumple el SLA y el límite de aprobación automática.",
  },
  {
    icon: ShieldCheck,
    title: "Liquidez y deduplicación",
    body: "Saldo presupuestario disponible y sin cobros duplicados.",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Tu nuevo analista de cuentas por pagar IA · 24/7 disponible
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl lg:text-6xl">
          Jippay, tu agente de pago listo.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-500 sm:text-lg">
          La IA lee. El código decide. Tú descansas.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-zinc-500">
          Un agente de pago inteligente: lectura automatizada de documentos
          combinada con auditoría de código determinista. Extrae, valida y
          resuelve facturas a escala, sin que la IA pueda autorizar pagos ni
          tocar tu presupuesto.
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
      </section>

      {/* 3 validaciones core */}
      <section className="mx-auto mt-20 max-w-4xl">
        <h2 className="text-center text-sm font-medium uppercase tracking-widest text-zinc-400">
          3 validaciones core
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CORE_VALIDATIONS.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-6"
              >
                <Icon className="h-5 w-5 text-zinc-300" />
                <h3 className="mt-4 text-sm font-medium text-zinc-100">{v.title}</h3>
                <p className="mt-2 text-xs leading-5 text-zinc-500">{v.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Ingesta a escala */}
      <section className="mx-auto mt-20 max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500">
          <Database className="h-4 w-4" />
          Ingiere a escala
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
          Alimentado por tu ERP, en tiempo real.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
          Jippay se alimenta constantemente de Odoo, QuickBooks, carpetas de
          archivos y correos corporativos. El demo simula esa operación continua
          y te deja supervisar cada excepción con un movimiento manual firmado.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 text-xs text-zinc-600">
          <RefreshCw className="h-3.5 w-3.5" />
          Sincronización continua con el ERP
        </div>
      </section>

      {/* IA + control determinista */}
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