"use client";

import { BrainCircuit, Gavel } from "lucide-react";
import { DemoWizard } from "@/components/demo/DemoWizard";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      {/* Hero compacto */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Agente Neuro-Simbólico AP
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl lg:text-6xl">
          La IA lee. El código decide. Tú descansas.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-500 sm:text-base">
          Configura tu criterio, ingiere facturas y supervisa las excepciones en tres pasos.
        </p>
      </section>

      {/* Wizard de demo en 3 pasos */}
      <section className="mt-12">
        <DemoWizard />
      </section>

      {/* Nota de separación neuro-simbólica */}
      <section className="mx-auto mt-14 max-w-2xl text-center">
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
          <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
            <BrainCircuit className="h-4 w-4" />
            La IA extrae e interpreta
          </span>
          <span className="text-zinc-700">→</span>
          <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
            <Gavel className="h-4 w-4" />
            El motor determinista decide
          </span>
        </div>
      </section>
    </div>
  );
}