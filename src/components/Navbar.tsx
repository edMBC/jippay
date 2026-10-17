"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Contrast,
  Cpu,
  Home,
  Lock,
  Moon,
  Settings,
  ShieldCheck,
  Terminal,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { ROLE_LABELS, ROLE_OPTIONS, type UserRole } from "@/lib/auth/roles";

const LINKS = [
  { href: "/", label: "Pitch", icon: Home },
  { href: "/sales", label: "Enterprise & ROI", icon: TrendingUp },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/admin", label: "Gobierno & ERP", icon: Settings },
  { href: "/login", label: "Acceso", icon: Lock },
];

type ThemeMode = "obsidian" | "titanium";
type Engine = "deepseek-llm" | "deterministic-fallback";

export function Navbar() {
  const pathname = usePathname();
  const { rules, dbHealth, user, loginDemo, logout } = useStore();
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "obsidian";
    const saved = window.localStorage.getItem("jippay_theme");
    return saved === "titanium" || saved === "obsidian" ? saved : "obsidian";
  });
  const [engine, setEngine] = useState<Engine>("deterministic-fallback");

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem("jippay_theme", mode);
  }, [mode]);

  useEffect(() => {
    fetch("/api/agent-status")
      .then((response) => response.json())
      .then((data: { engine?: Engine }) => {
        if (data.engine) setEngine(data.engine);
      })
      .catch(() => {
        // Sin conexión: se mantiene el valor por defecto.
      });
  }, []);

  const budget = rules.presupuesto_mensual_restante;
  const limit = rules.limite_monto_automatico;
  const providerCount = rules.proveedores_permitidos.length;

  return (
    <>
      {/* Barra superior (desktop) */}
      <header className="sticky top-0 z-40 hidden border-b border-white/[0.06] bg-zinc-900/80 backdrop-blur-2xl md:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-zinc-100">
                Jippay<span className="text-zinc-500">.</span>
              </span>
            </Link>
            <span className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-300">
              v2.0 FullStack
            </span>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-1.5 text-xs">
              <span className="text-zinc-500">Presupuesto: </span>
              <span className="font-mono font-semibold text-zinc-200">
                ${budget.toLocaleString()}
              </span>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-1.5 text-xs">
              <span className="text-zinc-500">Límite: </span>
              <span className="font-mono font-semibold text-zinc-200">
                ${limit.toLocaleString()}
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-1.5 text-xs"
              title="Estado de bases de datos"
            >
              <Activity
                className={`h-3.5 w-3.5 ${dbHealth ? "text-zinc-300" : "text-zinc-600"}`}
              />
              <span className="text-zinc-500">
                {dbHealth ? "DB conectada" : "DB sin verificar"}
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-1.5 text-xs"
              title="Motor de extracción y contexto de reglas"
            >
              <Cpu
                className={`h-3.5 w-3.5 ${
                  engine === "deepseek-llm" ? "text-emerald-400" : "text-zinc-400"
                }`}
              />
              <span className="text-zinc-400">
                {engine === "deepseek-llm"
                  ? "DeepSeek Agent Ready"
                  : "Heuristic Engine Active"}
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                {providerCount} prov
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-1.5 text-xs"
              title={user ? ROLE_LABELS[user.role] : "Seleccionar rol SOX"}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
              <select
                value={user?.role ?? ""}
                onChange={(e) => {
                  const role = e.target.value as UserRole;
                  if (role) void loginDemo(role);
                }}
                className="bg-transparent text-zinc-300 outline-none"
              >
                {!user && <option value="">Elegir rol SOX…</option>}
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-zinc-900">
                    {o.label}
                  </option>
                ))}
              </select>
              {user && (
                <button
                  type="button"
                  onClick={() => void logout()}
                  title="Cerrar sesión"
                  className="text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  <Lock className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-zinc-950/60 p-0.5">
              <button
                type="button"
                onClick={() => setMode("obsidian")}
                title="Obsidian iOS Dark"
                className={`rounded-md p-1.5 transition-colors ${
                  mode === "obsidian" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMode("titanium")}
                title="Titanium High-Contrast"
                className={`rounded-md p-1.5 transition-colors ${
                  mode === "titanium" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <Contrast className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-zinc-800 text-zinc-100 shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Barra superior compacta (móvil) */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-900/80 backdrop-blur-2xl md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-zinc-100">
            Jippay<span className="text-zinc-500">.</span>
          </Link>
          <div className="flex items-center gap-2">
            <span
              className="hidden items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-400 sm:inline-flex"
              title="Motor de extracción"
            >
              <Cpu
                className={`h-3 w-3 ${
                  engine === "deepseek-llm" ? "text-emerald-400" : "text-zinc-400"
                }`}
              />
              {engine === "deepseek-llm" ? "DeepSeek" : "Heuristic"}
            </span>
            <select
              value={user?.role ?? ""}
              onChange={(e) => {
                const role = e.target.value as UserRole;
                if (role) void loginDemo(role);
              }}
              title={user ? ROLE_LABELS[user.role] : "Rol SOX"}
              className="max-w-[96px] rounded-md border border-zinc-700 bg-zinc-800 px-1 py-1 text-[10px] text-zinc-300 outline-none"
            >
              {!user && <option value="">Rol</option>}
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMode(mode === "obsidian" ? "titanium" : "obsidian")}
              title={mode === "obsidian" ? "Cambiar a Titanium High-Contrast" : "Cambiar a Obsidian iOS Dark"}
              className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-400"
            >
              {mode === "obsidian" ? (
                <Moon className="h-3.5 w-3.5" />
              ) : (
                <Contrast className="h-3.5 w-3.5" />
              )}
            </button>
            <span className="font-mono text-xs text-zinc-400">${budget.toLocaleString()}</span>
            <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
              v2.0
            </span>
          </div>
        </div>
      </header>

      {/* iOS Bottom Tab Bar (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-zinc-900/85 backdrop-blur-2xl md:hidden">
        <div
          className="flex items-stretch justify-around"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                {link.label.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
