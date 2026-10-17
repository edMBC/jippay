"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Mail, Wallet } from "lucide-react";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";
import { useStore } from "@/lib/store";
import { ROLE_OPTIONS, type UserRole } from "@/lib/auth/roles";

export default function RegisterPage() {
  const router = useRouter();
  const { refreshSession, updateRules } = useStore();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [budget, setBudget] = useState(5000);
  const [role, setRole] = useState<UserRole>("CFO_ADMIN");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, email, budget, role }),
      });
      if (!response.ok) {
        setError("No se pudo completar el registro. Revisa los datos.");
        return;
      }
      const data = (await response.json()) as {
        rules?: { limite_monto_automatico: number; presupuesto_mensual_restante: number };
      };
      if (data.rules) {
        updateRules({
          limite_monto_automatico: data.rules.limite_monto_automatico,
          presupuesto_mensual_restante: data.rules.presupuesto_mensual_restante,
        });
      }
      await refreshSession();
      router.push("/terminal");
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6">
      <div className="mb-8 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Onboarding de empresa
        </span>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-100">Crear cuenta</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Empresas de EE. UU. con equipos de operaciones en LATAM.
        </p>
      </div>

      <IOSGlassCard className="p-6 sm:p-8">
        <label className="mb-1 block text-xs text-zinc-500">Nombre de empresa</label>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
          <Building2 className="h-4 w-4 text-zinc-500" />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <label className="mb-1 block text-xs text-zinc-500">Email corporativo</label>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
          <Mail className="h-4 w-4 text-zinc-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ap@acme.com"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <label className="mb-1 block text-xs text-zinc-500">
          Presupuesto mensual inicial (USD)
        </label>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
          <Wallet className="h-4 w-4 text-zinc-500" />
          <input
            type="number"
            min={1}
            value={budget}
            onChange={(e) => setBudget(Math.max(1, Number(e.target.value)))}
            className="w-full bg-transparent text-sm text-zinc-100 focus:outline-none"
          />
        </div>

        <label className="mb-1 block text-xs text-zinc-500">Rol inicial</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900">
              {o.label}
            </option>
          ))}
        </select>

        {error && (
          <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
        >
          Crear cuenta y continuar
        </button>
      </IOSGlassCard>
    </div>
  );
}
