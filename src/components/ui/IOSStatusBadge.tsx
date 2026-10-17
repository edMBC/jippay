import type { AgentDecision } from "@/lib/schemas";
import { Check, Clock, ShieldOff } from "lucide-react";

const CONFIG: Record<
  AgentDecision["estado"],
  { className: string; icon: typeof Check; label: string }
> = {
  PAGAR: {
    className: "bg-zinc-100 text-zinc-950 font-semibold",
    icon: Check,
    label: "PAGAR",
  },
  ESCALAR: {
    className: "bg-zinc-800/90 text-zinc-200 border border-zinc-500",
    icon: Clock,
    label: "ESCALAR",
  },
  FRENAR: {
    className: "bg-zinc-950 text-zinc-400 border border-zinc-700 line-through decoration-zinc-600",
    icon: ShieldOff,
    label: "FRENAR",
  },
};

export function IOSStatusBadge({ estado }: { estado: AgentDecision["estado"] }) {
  const config = CONFIG[estado];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${config.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}
