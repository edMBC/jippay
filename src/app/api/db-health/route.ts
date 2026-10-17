import { getAllAdapters } from "@/lib/db/adapters";
import { getLedgerCapabilities } from "@/lib/finance/factory";

export async function GET() {
  const adapters = getAllAdapters();
  const results = await Promise.all(adapters.map((adapter) => adapter.connect()));
  const financiero = getLedgerCapabilities();

  return Response.json({
    ok: true,
    motor: {
      estado: "determinista",
      ia: "no requerida para decisiones",
    },
    adaptadores: results,
    financiero,
    timestamp: new Date().toISOString(),
  });
}
