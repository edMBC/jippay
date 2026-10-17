"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Gavel, ShieldCheck, UserCheck, X } from "lucide-react";

const STEPS = [
  {
    icon: BrainCircuit,
    title: "Ingesta multimodal",
    body: "PDFs, imágenes, CSV de ERP, correos y capturas móviles. La IA estructura cada documento en campos verificables.",
  },
  {
    icon: Gavel,
    title: "Motor determinista",
    body: "Reglas de oro, detección de duplicados, anti-spoofing por Levenshtein y conversión FX transparente.",
  },
  {
    icon: UserCheck,
    title: "Control humano",
    body: "Solo las excepciones se escalan a un aprobador, con justificación y registro inmutable.",
  },
] as const;

export function ProcessExplainer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-6 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
      >
        <ShieldCheck className="h-4 w-4" />
        Cómo validamos
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-fade-slide w-full max-w-lg rounded-3xl border border-white/[0.08] bg-zinc-950 p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-medium text-zinc-100">Cómo validamos</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-zinc-300" />
                      <h3 className="text-sm font-medium text-zinc-100">{step.title}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{step.body}</p>
                  </div>
                );
              })}
            </div>

            <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-600">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La IA nunca autoriza pagos. Las decisiones nacen del motor determinista y cada
              excepción queda firmada con evidencia auditable ISO/SOX.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
