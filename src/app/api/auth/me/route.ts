import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { resolveRequestIdentity } from "@/lib/auth/identity";
import { getTransactionalLedger } from "@/lib/finance/factory";
import { defaultCompanyRules } from "@/lib/mock-data";

/**
 * Devuelve la identidad de sesión actual.
 *
 * - Con Supabase configurado: resuelve la identidad verificada (Supabase Auth) y
 *   la mapea a una membresía persistente para devolver `company_id` y `role`.
 *   Si el usuario autenticado aún no tiene membresía, la auto-provisiona de forma
 *   idempotente (empresa por defecto + membresía con `auth_user_id`).
 * - Sin Supabase (demo local): devuelve el usuario de la cookie demo firmada.
 */
export async function GET(request: Request) {
  // 1. Identidad demo (cookie firmada local), prioritaria para el sandbox local.
  const demoUser = getSessionUser(request.headers.get("cookie"));
  if (demoUser) {
    return Response.json({ user: demoUser });
  }

  // 2. Identidad Supabase verificada en el servidor + membresía persistente.
  const identity = await resolveRequestIdentity(request);
  if (identity && identity.provider === "supabase") {
    const ledger = getTransactionalLedger();

    let membership = await ledger.getActiveMembershipByAuthUser(identity.userId);

    // Auto-provisionamiento idempotente para usuarios reales sin membresía previa.
    if (!membership && identity.email) {
      const companyId = `company-${identity.userId.slice(0, 8)}`;
      const period = new Date().toISOString().slice(0, 7);
      await ledger.seedCompany(companyId, identity.email.split("@")[1] ?? "Mi empresa", defaultCompanyRules, period);
      await ledger.provisionMembership(companyId, identity.email, identity.userId, "CFO_ADMIN");
      membership = await ledger.getActiveMembershipByAuthUser(identity.userId);
    }

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

