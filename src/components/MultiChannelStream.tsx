"use client";

import { useEffect, useState } from "react";
import { Database, Mail, MessageCircle } from "lucide-react";

/**
 * "Multi-Channel Ingestion Stream": visualización animada de cómo el motor
 * absorbe documentos desde fuentes heterogéneas. Cada canal muestra un estado
 * activo y una descripción del procesamiento. Es un componente visual (client)
 * que refuerza el diferencial multicanal; no ejecuta conexiones reales.
 */

const CHANNELS = [
  {
    id: "erp",
    label: "Odoo · QuickBooks · a2",
    detail: "Sincronización nativa de contabilidad",
    icon: Database,
    tint: "text-emerald-400",
  },
  {
    id: "whatsapp",
    label: "WhatsApp Business",
    detail: "Comprobantes y notas de entrega",
    icon: MessageCircle,
    tint: "text-zinc-200",
  },
  {
    id: "imap",
    label: "Correo corporativo / IMAP",
    detail: "Captura automática de facturas PDF adjuntas",
    icon: Mail,
    tint: "text-zinc-400",
  },
] as const;

export function MultiChannelStream() {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPulse((p) => (p + 1) % CHANNELS.length);
    }, 1200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-6 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">Multi-Channel Ingestion Stream</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Un solo motor, muchas fuentes. Las mismas reglas SOX en todas.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
          en vivo
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CHANNELS.map((channel, i) => {
          const Icon = channel.icon;
          const active = i === pulse;
          return (
            <div
              key={channel.id}
              className={`rounded-2xl border p-4 transition-all duration-500 ${
                active
                  ? "border-zinc-600 bg-zinc-900"
                  : "border-zinc-800 bg-zinc-950"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${channel.tint}`} />
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    active ? "bg-emerald-400" : "bg-zinc-700"
                  }`}
                />
              </div>
              <p className="mt-3 text-sm font-medium text-zinc-100">{channel.label}</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">{channel.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
