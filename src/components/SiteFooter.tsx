import Link from "next/link";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/process", label: "Cómo validamos" },
  { href: "/about", label: "Quiénes somos" },
  { href: "/terms", label: "Términos" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-zinc-950/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 sm:flex-row">
        <p className="text-xs text-zinc-600">
          Jippay<span className="text-zinc-500">.</span> — agente de pago inteligente. No es
          una pasarela de pago.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
