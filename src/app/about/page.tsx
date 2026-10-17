import type { Metadata } from "next";
import { Globe2, Lock, ScrollText, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Quiénes Somos — Jippay",
  description:
    "La visión de Jippay: automatizar las cuentas por pagar transfronterizas entre EE. UU. y LATAM con seguridad y gobernanza financiera.",
};

const PILLARS = [
  {
    icon: Globe2,
    title: "Pagos transfronterizos sin fricción",
    body: "Operar entre EE. UU. y LATAM multiplica proveedores, monedas y formatos. Jippay centraliza esa complejidad para que el cierre de mes deje de ser un cuello de botella.",
  },
  {
    icon: Lock,
    title: "Seguridad y soberanía del dato",
    body: "Tus documentos y reglas permanecen bajo tu control. La IA solo interpreta información; las decisiones las produce un motor auditable.",
  },
  {
    icon: ShieldCheck,
    title: "Gobernanza financiera",
    body: "Separación de funciones, trazabilidad inmutable y controles compatibles con ISO 20022 y SOX, sin tocar pasarelas de pago.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-10">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Institucional
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
          Quiénes Somos
        </h1>
      </div>

      <div className="space-y-6 text-sm leading-7 text-zinc-300">
        <p>
          Jippay nace de una frustración cotidiana en equipos financieros: el cierre de mes
          entre Estados Unidos y Latinoamérica se convierte en una montaña de facturas, monedas y
          proveedores que exige horas de revisión manual y deja poco margen para lo importante.
        </p>
        <p>
          Somos un <strong>agente de pago inteligente</strong>: una capa de auditoría
          automatizada que lee documentos, aplica reglas deterministas y emite decisiones
          explicables —aprobar, escalar o frenar— antes de que un humano firme las excepciones.
        </p>
        <p>
          No somos una pasarela de pago ni una entidad financiera. No movemos dinero, no
          custodiamos fondos y no liquidamos transferencias. Nos dedicamos a una sola cosa:
          darle al fundador o al CFO la tranquilidad de que cada factura fue validada con
          criterio, seguridad y gobernanza.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.title}
              className="rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-6"
            >
              <Icon className="h-5 w-5 text-zinc-300" />
              <h2 className="mt-4 text-sm font-medium text-zinc-100">{p.title}</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{p.body}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-12 flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        <p className="text-xs leading-5 text-zinc-500">
          Consulta también nuestra política de uso en la sección de términos. Jippay opera
          como validador y emisor de decisiones contables, nunca como ejecutor de pagos.
        </p>
      </div>
    </div>
  );
}
