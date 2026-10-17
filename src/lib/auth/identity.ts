import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser, type SessionUser } from "./session";
import type { UserRole } from "./roles";

/**
 * Identidad autenticada y verificada en el servidor.
 *
 * Dos fuentes, una sola autoridad en producción:
 * - `supabase`: verificación del token de sesión contra Supabase Auth (`auth.getUser`).
 * - `demo`: cookie firmada local (solo desarrollo/pruebas), marcada explícitamente.
 *
 * La identidad de demostración NUNCA se trata como identidad corporativa real.
 */

export type IdentityProvider = "supabase" | "demo";

export interface VerifiedIdentity {
  /** ID estable del usuario (Supabase `user.id` o `demo:<email>`). */
  userId: string;
  email: string;
  provider: IdentityProvider;
  /** Solo presente en identidad demo. */
  demoUser?: SessionUser;
}

/** Configuración de Supabase Auth disponible. */
export interface SupabaseAuthConfig {
  url: string;
  serviceRoleKey: string;
  client: SupabaseClient;
}

let supabaseAuthClient: SupabaseClient | null = null;
let supabaseAuthConfigured = false;
let supabaseAuthMissingReason: string | null = null;

/** Devuelve la configuración de Supabase Auth o `null` si no está disponible. */
export function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    supabaseAuthMissingReason = "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY no configurados";
    return null;
  }

  if (!supabaseAuthClient) {
    supabaseAuthClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  supabaseAuthConfigured = true;
  return { url, serviceRoleKey, client: supabaseAuthClient };
}

export function isSupabaseAuthConfigured(): boolean {
  return supabaseAuthConfigured;
}

export function supabaseAuthMissingReasonText(): string | null {
  return supabaseAuthMissingReason;
}

/** Nombre de la cookie de sesión de Supabase Auth (token de acceso). */
export const SUPABASE_SESSION_COOKIE = "sb-access-token";

/**
 * Verifica un token de Supabase Auth en el servidor (`auth.getUser`), que además
 * de decodificar el JWT comprueba su firma y estado en Supabase.
 */
async function verifySupabaseToken(token: string): Promise<{ userId: string; email: string } | null> {
  const config = getSupabaseAuthConfig();
  if (!config) return null;
  try {
    const { data, error } = await config.client.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? "" };
  } catch {
    return null;
  }
}

/**
 * Resuelve la identidad autenticada de una petición.
 *
 * Orden de preferencia:
 * 1. Si Supabase Auth está configurado y hay un token de sesión válido -> supabase.
 * 2. Si NO está configurado y no es producción -> cookie demo (aislada).
 * 3. En producción sin Supabase configurado -> null (fallo seguro).
 */
export async function resolveRequestIdentity(
  request: Request,
): Promise<VerifiedIdentity | null> {
  const production = process.env.NODE_ENV === "production";

  // 1. Supabase Auth (verificación real en servidor).
  if (getSupabaseAuthConfig()) {
    const token = extractSupabaseToken(request);
    if (token) {
      const verified = await verifySupabaseToken(token);
      if (verified) {
        return { userId: verified.userId, email: verified.email, provider: "supabase" };
      }
    }
    // Supabase configurado pero sesión ausente/inválida: fallo seguro (no cae a demo).
    return null;
  }

  // 2. Demo local (solo no-producción).
  if (!production) {
    const demoUser = getSessionUser(request.headers.get("cookie"));
    if (demoUser) {
      return {
        userId: demoUser.auth_user_id ?? `demo:${demoUser.email}`,
        email: demoUser.email,
        provider: "demo",
        demoUser,
      };
    }
  }

  return null;
}

function extractSupabaseToken(request: Request): string | null {
  // Cabecera Authorization: Bearer <token>.
  const authz = request.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7).trim();

  // Cookie sb-access-token.
  const cookie = request.headers.get("cookie");
  if (cookie) {
    const cookies = cookie.split(";").map((c) => c.trim());
    const match = cookies.find((c) => c.startsWith(`${SUPABASE_SESSION_COOKIE}=`));
    if (match) {
      const value = match.slice(SUPABASE_SESSION_COOKIE.length + 1);
      return decodeURIComponent(value) || null;
    }
  }
  return null;
}

export { type UserRole };
