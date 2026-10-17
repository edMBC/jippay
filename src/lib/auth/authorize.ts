import { getSessionUser, type SessionUser } from "./session";
import type { UserRole } from "./roles";
import { resolveRequestIdentity, type VerifiedIdentity } from "./identity";
import type { TransactionalLedger } from "../finance/ledger";
import type { CompanyMembership } from "../finance/model";

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
export function deniedResponse(status: 401 | 403 | 503): Response {
  const message =
    status === 401 ? "No autenticado" : status === 403 ? "No autorizado" : "Servicio de identidad no disponible";
  return Response.json({ error: message }, { status });
}

/**
 * Contexto de autorización completo derivado de una identidad verificada y una
 * membresía persistente activa. Usado por las rutas financieras.
 */
export interface AuthorizedContext {
  identity: VerifiedIdentity;
  membership: CompanyMembership;
  companyId: string;
  role: string;
  demo: boolean;
}

export type AuthorizeResult =
  | { ok: true; context: AuthorizedContext }
  | { ok: false; status: 401 | 403 | 503 };

/**
 * Autorización financiera con membresía verificada (asíncrona).
 *
 * Orden:
 *   1. Resuelve la identidad verificada (Supabase Auth, o demo en no-producción).
 *   2. En producción, una identidad demo se deniega.
 *   3. Resuelve la membresía activa persistente por `auth_user_id`.
 *   4. Comprueba el rol dentro de la membresía.
 */
export async function authorizeWithMembership(
  ledger: TransactionalLedger,
  request: Request,
  allowedRoles: ReadonlyArray<UserRole>,
): Promise<AuthorizeResult> {
  const identity = await resolveRequestIdentity(request);
  if (!identity) return { ok: false, status: 401 };

  if (process.env.NODE_ENV === "production" && identity.provider === "demo") {
    return { ok: false, status: 401 };
  }

  const membership = await ledger.getActiveMembershipByAuthUser(identity.userId);
  if (!membership) {
    // Sin membresía persistente verificada: denegado (no se inventa empresa).
    return { ok: false, status: 403 };
  }

  if (!allowedRoles.includes(membership.role as UserRole)) {
    return { ok: false, status: 403 };
  }

  return {
    ok: true,
    context: {
      identity,
      membership,
      companyId: membership.companyId,
      role: membership.role,
      demo: identity.provider === "demo",
    },
  };
}
