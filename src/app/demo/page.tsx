import { DemoWizard } from "@/components/demo/DemoWizard";

export default function DemoPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Simulador Interactivo
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
          Demo de agente
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
          Configura tu criterio, ingiere facturas a escala y supervisa cada excepción.
        </p>
      </div>

      <DemoWizard />
    </div>
  );
}
