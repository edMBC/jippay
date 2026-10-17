import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { resolveRequestIdentity } from "@/lib/auth/identity";
import { getTransactionalLedger } from "@/lib/finance/factory";

/**
 * Devuelve la identidad de sesión actual.
 *
 * - Con Supabase configurado: resuelve la identidad verificada (Supabase Auth) y
 *   la mapea a una membresía persistente para devolver `company_id` y `role`.
 * - Sin Supabase (demo local): devuelve el usuario de la cookie demo firmada.
 */
export async function GET(request: Request) {
  // 1. Identidad demo (cookie firmada local), solo cuando Supabase no está activo.
  const demoUser = getSessionUser(request.headers.get("cookie"));
  if (demoUser) {
    return Response.json({ user: demoUser });
  }

  // 2. Identidad Supabase verificada en el servidor + membresía persistente.
  const identity = await resolveRequestIdentity(request);
  if (identity && identity.provider === "supabase") {
    const ledger = getTransactionalLedger();
    const membership = await ledger.getActiveMembershipByAuthUser(identity.userId);
    if (membership) {
      const user: SessionUser = {
        email: membership.userEmail,
        role: membership.role as SessionUser["role"],
        company_id: membership.companyId,
        company: membership.companyId,
        name: membership.userEmail.split("@")[0],
        auth_user_id: identity.userId,
        identity_provider: "supabase",
      };
      return Response.json({ user });
    }
  }

  return Response.json({ user: null });
}

