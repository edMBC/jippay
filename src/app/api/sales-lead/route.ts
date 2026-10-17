import { z } from "zod";

const SalesLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1),
  plan: z.enum(["Seed", "Growth LATAM", "Enterprise Custom"]),
  monthlyInvoices: z.number().int().positive().optional(),
  message: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsed = SalesLeadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos de prospecto inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Registro no bloqueante del prospecto comercial (demo). En producción conectaría
  // con un CRM o Supabase. Devolvemos un id determinista para trazabilidad.
  const lead = {
    ...parsed.data,
    id: `LEAD-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString(),
  };

  return Response.json({ ok: true, lead }, { status: 201 });
}
