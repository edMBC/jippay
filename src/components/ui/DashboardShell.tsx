"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Gavel,
  Inbox,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/auth/roles";

/**
 * DashboardShell: layout base Streamline (iOS Dark) para las vistas protegidas.
 *
 * - Barra lateral fija con la navegación principal.
 * - Topbar limpia con el estado de sesión y el cierre de sesión.
 * - Banner corporativo que lee el rol del usuario logueado.
 *
 * Es un contenedor puramente visual: la autorización real la aplica `src/proxy.ts`
 * (Supabase Auth) y la resolución de rol/membresía ocurre en `/api/auth/me`.
 */

const NAV = [
  { label: "Panel de Control", href: "/admin", icon: LayoutDashboard },
  { label: "Terminal de Auditoría", href: "/terminal", icon: TerminalSquare },
  { label: "Inbox Multicanal", href: "/demo", icon: Inbox },
  { label: "Reglas SOX", href: "/admin", icon: Gavel },
];

const ROLE_SHORT_LABEL: Record<string, string> = {
  CFO_ADMIN: "CFO",
  CONTROLLER_APPROVER: "Controller",
  AUDITOR_VIEWER: "Auditor SOX",
};

export function DashboardShell({
  children,
  activePath,
}: {
  children: React.ReactNode;
  activePath?: string;
}) {
  const { user, logout } = useStore();
  const router = useRouter();

  const roleLabel = user
    ? (ROLE_SHORT_LABEL[user.role] ?? ROLE_LABELS[user.role])
    : "Sin sesión";

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Barra lateral fija */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-zinc-800/80 px-5">
          <Link href="/admin" className="text-lg font-bold tracking-tight text-zinc-100">
            Jippay<span className="text-zinc-500">.</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = activePath === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800/80 p-4">
          <p className="text-[11px] leading-4 text-zinc-600">
            Jippay · control SOX & pagos ISO 20022
          </p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="truncate font-medium text-zinc-200">
              Sesión iniciada como {roleLabel}
            </span>
            {user && (
              <span className="hidden truncate font-mono text-xs text-zinc-600 sm:inline">
                {user.email}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </header>

        {/* Banner de bienvenida corporativo */}
        <div className="border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-3 sm:px-6">
          <p className="text-sm font-medium text-zinc-200">
            Panel de Control SOX
            <span className="text-zinc-500"> — Sesión Iniciada como </span>
            <span className="text-zinc-100">{roleLabel}</span>
          </p>
        </div>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
