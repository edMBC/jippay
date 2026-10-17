import { z } from "zod";
import {
  canIssueSessions,
  DEMO_USERS,
  ROLE_TO_DEMO_EMAIL,
  serializeSessionCookie,
  type SessionUser,
  type UserRole,
} from "@/lib/auth/session";

const LoginBodySchema = z.object({
  email: z.string().email().optional(),
  password: z.string().optional(),
  role: z.enum(["CFO_ADMIN", "CONTROLLER_APPROVER", "AUDITOR_VIEWER"]).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsed = LoginBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Credenciales inválidas" }, { status: 400 });
  }

  let user: SessionUser | null = null;

  // 1-Click SOX Role Sandbox: cambio rápido de rol en la demo.
  if (parsed.data.role) {
    const role = parsed.data.role as UserRole;
    const email = ROLE_TO_DEMO_EMAIL[role];
    user = DEMO_USERS[email] ?? { email, role };
  } else if (parsed.data.email) {
    // Login por credenciales (fallback demo): contraseña demo "jippay2026".
    const candidate = DEMO_USERS[parsed.data.email.toLowerCase()];
    if (candidate && parsed.data.password === "jippay2026") {
      user = candidate;
    }
  }

  if (!user) {
    return Response.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  if (!canIssueSessions()) {
    return Response.json(
      { error: "El servicio de sesiones no está disponible" },
      { status: 503 },
    );
  }

  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": serializeSessionCookie(user),
    },
  });
}
