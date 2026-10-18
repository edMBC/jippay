import Link from "next/link";
import { ArrowRight, Settings2 } from "lucide-react";
import { KeynoteDemo } from "@/components/demo/KeynoteDemo";

export default function DemoPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950">
      <KeynoteDemo />
      <div className="flex flex-col items-center gap-4 px-4 pb-14">
        <Link
          href="/login"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white"
        >
          Conectar mis fuentes y empezar
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/demo/config"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Abrir consola de configuración (orígenes y reglas)
        </Link>
      </div>
    </div>
  );
}
