"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";
import { useStore } from "@/lib/store";
import { ROLE_OPTIONS } from "@/lib/auth/roles";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  CFO_ADMIN: "Control total de reglas, ERP y presupuesto.",
  CONTROLLER_APPROVER: "Aprobación Human-in-the-Loop de escalamientos.",
  AUDITOR_VIEWER: "Auditoría forense en modo solo lectura.",
};

export default function LoginPage() {
  const router = useRouter();
  const { login, loginDemo } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitCredentials = async () => {
    setError(null);
    setSubmitting(true);
    const user = await login(email, password);
    setSubmitting(false);
    if (user) {
      router.push("/terminal");
    } else {
      setError("Credenciales incorrectas. Usa jippay2026 como contraseña demo.");
    }
  };

  const enterRole = async (role: (typeof ROLE_OPTIONS)[number]["value"]) => {
    setError(null);
    setSubmitting(true);
    const user = await loginDemo(role);
    setSubmitting(false);
    if (user) router.push("/terminal");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
      <div className="mb-8 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Acceso corporativo
        </span>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-100">Bienvenido a Jippay</h1>
        <p className="mt-2 text-sm text-zinc-400">
          SOX RBAC · ISO 20022 · 3-Way Match ERP
        </p>
      </div>

      <IOSGlassCard className="p-6 sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-4 w-4 text-zinc-400" />
          <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-400">
            Login corporativo
          </h2>
        </div>

        <label className="mb-1 block text-xs text-zinc-500">Email</label>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
          <Mail className="h-4 w-4 text-zinc-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cfo@jippay.us"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <label className="mb-1 block text-xs text-zinc-500">Password</label>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2">
          <Lock className="h-4 w-4 text-zinc-500" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitCredentials();
            }}
            placeholder="jippay2026"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void submitCredentials()}
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Verificando…" : "Entrar"}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          ¿Sin cuenta?{" "}
          <Link href="/register" className="text-zinc-300 underline hover:text-zinc-100">
            Registra tu empresa
          </Link>
        </p>
      </IOSGlassCard>

      <div className="mt-8">
        <h2 className="mb-3 text-center text-sm font-medium text-zinc-300">
          1-Click SOX Role Sandbox
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role.value}
              type="button"
              onClick={() => void enterRole(role.value)}
              disabled={submitting}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/65 p-4 text-left transition-colors hover:border-zinc-600 disabled:opacity-50"
            >
              <ShieldCheck className="h-5 w-5 text-zinc-400" />
              <span className="mt-2 block text-sm font-medium text-zinc-200">{role.label}</span>
              <span className="mt-1 block font-mono text-[11px] text-zinc-500">{role.email}</span>
              <span className="mt-1 block text-xs text-zinc-400">
                {ROLE_DESCRIPTIONS[role.value]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
