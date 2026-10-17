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
      </div>

      <DemoWizard />
    </div>
  );
}
