import Link from "next/link";
import { Settings2 } from "lucide-react";
import { KeynoteDemo } from "@/components/demo/KeynoteDemo";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#09090b]">
      <KeynoteDemo />
      <div className="pb-10 text-center">
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
