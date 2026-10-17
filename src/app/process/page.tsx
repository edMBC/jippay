import type { Metadata } from "next";
import { BrainCircuit, Gavel, ShieldCheck, UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Cómo validamos — Jippay",
  description:
    "El proceso de validación de Jippay: ingesta multimodal, motor determinista y control humano con trazabilidad ISO/SOX.",
};

const STEPS = [
  {
    icon: BrainCircuit,
    title: "1 · Ingesta multimodal y extracción por IA",
    body: "Leemos PDFs, imágenes, CSV de ERP, correos y capturas móviles. La IA estructura cada documento en campos verificables: emisor, importe, moneda, fecha e identidad comercial.",
    points: ["Chunks de texto en PNG/SVG", "CSV de Odoo/QuickBooks/a2", "Fotos de recibos desde el móvil"],
  },
  {
    icon: Gavel,
    title: "2 · Evaluación estricta por el motor determinista",
    body: "El motor aplica reglas de oro sin aleatoriedad: detección de prompt injection, duplicados por hash o identidad, anti-spoofing por distancia de Levenshtein y conversión FX transparente.",
    points: ["Reglas de oro (calidad, proveedor, presupuesto, acuerdo, límite)", "Anti-spoofing y deduplicación", "Conversión multimoneda auditada"],
  },
  {
    icon: UserCheck,
    title: "3 · Control humano (Human-in-the-Loop)",
    body: "Solo las excepciones se escalan a un aprobador autenticado, con justificación obligatoria y un registro inmutable de auditoría.",
    points: ["Segregación de funciones (SOX)", "Justificación y evidencia obligatorias", "Registro inmutable compatible ISO/SOX"],
  },
] as const;

export default function ProcessPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Nuestro Proceso
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
          Cómo validamos cada factura
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
          Tres capas independientes que convierten un documento ambiguo en una decisión auditable.
        </p>
      </div>

      <div className="space-y-4">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.title}
              className="rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-6"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-zinc-300" />
                <h2 className="text-base font-medium text-zinc-100">{step.title}</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{step.body}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {step.points.map((point) => (
                  <li
                    key={point}
                    className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] text-zinc-400"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        <p className="text-xs leading-5 text-zinc-500">
          La IA nunca autoriza pagos ni modifica presupuestos. Las decisiones nacen del motor
          determinista y cada excepción queda firmada por un humano con evidencia auditable.
        </p>
      </div>
    </div>
  );
}
