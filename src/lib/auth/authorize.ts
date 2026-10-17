import { getSessionUser, type SessionUser } from "./session";
import type { UserRole } from "./roles";

/**
 * Resultado de la autorización server-side.
 * - `ok: true` → usuario autenticado y autorizado.
 * - `ok: false` con `status` 401 → sesión ausente, inválida, manipulada o expirada.
 * - `ok: false` con `status` 403 → sesión válida pero sin permiso para la operación.
 */
export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 403 };

/**
 * Autorización centralizada (denegación por defecto).
 * La identidad y el rol se obtienen exclusivamente de la cookie firmada validada
 * por el servidor; nunca de campos enviados en el cuerpo de la petición.
 */
export function authorize(request: Request, allowedRoles: ReadonlyArray<UserRole>): AuthResult {
  const user = getSessionUser(request.headers.get("cookie"));
  if (!user) return { ok: false, status: 401 };
  if (!allowedRoles.includes(user.role)) return { ok: false, status: 403 };
  return { ok: true, user };
}

/** Respuesta JSON predecible y sin información sensible para denegaciones. */
export function deniedResponse(status: 401 | 403): Response {
  return Response.json(
    { error: status === 401 ? "No autenticado" : "No autorizado" },
    { status },
  );
}
