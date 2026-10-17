import type { SessionUser } from "../auth/roles";

/**
 * Contexto de empresa derivado exclusivamente de la identidad autenticada.
 *
 * La empresa efectiva NUNCA se obtiene de un `company_id` enviado por el navegador:
 * proviene del token de sesión firmado (y, cuando existe, de la membresía validada
 * en el servidor). La IA y el cuerpo de la petición carecen de permisos para
 * cambiar la identidad, la empresa o las autorizaciones.
 */

export interface CompanyContext {
  companyId: string;
  userEmail: string;
  role: string;
}

export type CompanyContextResult =
  | { ok: true; context: CompanyContext }
  | { ok: false; reason: string };

/**
 * Devuelve el contexto de empresa si la sesión autenticada declara una empresa
 * verificable. Sin `company_id` en el token, la operación financiera falla de
 * forma segura (no se inventa una empresa por defecto en producción).
 */
export function resolveCompanyContext(user: SessionUser | null): CompanyContextResult {
  if (!user) return { ok: false, reason: "No hay identidad autenticada" };
  const companyId = user.company_id;
  if (!companyId || !companyId.trim()) {
    return { ok: false, reason: "La sesión no declara una empresa verificable" };
  }
  return {
    ok: true,
    context: {
      companyId: companyId.trim(),
      userEmail: user.email,
      role: user.role,
    },
  };
}
