import { z } from "zod";
import {
  canIssueSessions,
  serializeSessionCookie,
  type SessionUser,
  type UserRole,
} from "@/lib/auth/session";

const RegisterBodySchema = z.object({
  company: z.string().min(1),
  email: z.string().email(),
  budget: z.number().positive(),
  role: z.enum(["CFO_ADMIN", "CONTROLLER_APPROVER", "AUDITOR_VIEWER"]).default("CFO_ADMIN"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsed = RegisterBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos de registro inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { company, email, budget, role } = parsed.data;

  // El registro público NO puede auto-asignarse roles privilegiados. El
  // provisionamiento de CFO_ADMIN/CONTROLLER_APPROVER es una operación
  // administrativa del servidor (no disponible desde este endpoint).
  if (role === "CFO_ADMIN" || role === "CONTROLLER_APPROVER") {
    return Response.json(
      { error: "No puede auto-asignarse un rol privilegiado" },
      { status: 403 },
    );
  }

  if (!canIssueSessions()) {
    return Response.json(
      { error: "El servicio de sesiones no está disponible" },
      { status: 503 },
    );
  }

  const user: SessionUser = {
    email,
    role: role as UserRole,
    company,
    name: email.split("@")[0],
  };

  // Reglas iniciales del tenant (presupuesto mensual = presupuesto declarado).
  const rules = {
    limite_monto_automatico: Math.min(1000, budget),
    presupuesto_mensual_restante: budget,
    proveedores_permitidos: [] as string[],
    acuerdos_por_proveedor: {} as Record<string, number>,
  };

  return new Response(JSON.stringify({ user, rules }), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": serializeSessionCookie(user),
    },
  });
}
