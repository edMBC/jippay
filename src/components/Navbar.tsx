"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Home, ScrollText, Terminal } from "lucide-react";
import { useStore } from "@/lib/store";

const NAV_LINKS = [
  { href: "/", label: "Demo", icon: Home },
  { href: "/terms", label: "Términos", icon: ScrollText },
] as const;

/**
 * Barra superior minimalista (3 elementos):
 *   1. Logo "Jippay." → raíz.
 *   2. Navegación central: Demo / Términos.
 *   3. Acción derecha: "Acceso" (o "Abrir Terminal" si hay sesión activa).
 */
export function Navbar() {
  const pathname = usePathname();
  const { user } = useStore();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const accessHref = user ? "/terminal" : "/login";
  const accessLabel = user ? "Abrir Terminal" : "Acceso";

  return (
    <>
      {/* Barra superior (desktop) */}
      <header className="sticky top-0 z-40 hidden border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 1. Logo */}
          <Link href="/" className="flex items-center gap-2" aria-label="Jippay — inicio">
            <span className="text-xl font-bold tracking-tight text-zinc-100">
              Jippay<span className="text-zinc-500">.</span>
            </span>
          </Link>

          {/* 2. Navegación central */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* 3. Acción derecha */}
          <Link
            href={accessHref}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            {user ? <Terminal className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {accessLabel}
          </Link>
        </div>
      </header>

      {/* Barra superior compacta (móvil) */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-zinc-100">
            Jippay<span className="text-zinc-500">.</span>
          </Link>
          <Link
            href={accessHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-sm font-semibold text-zinc-950"
          >
            {user ? <Terminal className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {accessLabel}
          </Link>
        </div>
      </header>

      {/* Bottom Tab Bar (móvil): Demo · Términos · Acceso */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-zinc-950/85 backdrop-blur-xl md:hidden">
        <div
          className="flex items-stretch justify-around"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
          <Link
            href={accessHref}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {user ? <Terminal className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
            {user ? "Terminal" : "Acceso"}
          </Link>
        </div>
      </nav>
    </>
  );
}