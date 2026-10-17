import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DemoWizard } from "@/components/demo/DemoWizard";

export default function DemoConfigPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <Link
          href="/demo"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la keynote
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-100">
          Consola de configuración
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Orígenes, reglas dinámicas, whitelist e ingesta semiautomática.
        </p>
      </div>

      <DemoWizard />
    </div>
  );
}
