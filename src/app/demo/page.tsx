import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DemoWizard } from "@/components/demo/DemoWizard";

export default function DemoPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Demo interactiva
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
          Tu agente de pago, en acción
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
          Conecta fuentes, define criterios, ingiere facturas y supervisa cada excepción.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-zinc-600">
          Esta demo usa el motor determinista real, sin escribir en el ledger. Para el
          flujo transaccional autenticado, entra a tu cuenta.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline"
        >
          Ir al flujo transaccional real
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <DemoWizard />
    </div>
  );
}
