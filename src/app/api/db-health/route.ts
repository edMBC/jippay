import { getAllAdapters } from "@/lib/db/adapters";

export async function GET() {
  const adapters = getAllAdapters();
  const results = await Promise.all(adapters.map((adapter) => adapter.connect()));

  return Response.json({
    ok: true,
    motor: {
      estado: "determinista",
      ia: "no requerida para decisiones",
    },
    adaptadores: results,
    timestamp: new Date().toISOString(),
  });
}
