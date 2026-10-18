import { createServerClient } from "@supabase/ssr";
import { getSessionUser, type SessionUser } from "./session";
import type { UserRole } from "./roles";

/**
 * Identidad autenticada y verificada en el servidor.
 *
 * Dos fuentes, una sola autoridad en producción:
 * - `supabase`: verificación de la sesión contra Supabase Auth (`auth.getUser`),
 *   leyendo las cookies de sesión gestionadas por `@supabase/ssr`.
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

/** URL del proyecto Supabase (servidor o público). */
function supabaseUrl(): string | null {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

/** True si hay configuración mínima para verificar una sesión Supabase. */
function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Parsea la cabecera `Cookie` en pares `{ name, value }`. */
function parseCookies(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  return header.split(";").map((chunk) => {
    const idx = chunk.indexOf("=");
    if (idx < 0) return { name: chunk.trim(), value: "" };
    return { name: chunk.slice(0, idx).trim(), value: chunk.slice(idx + 1).trim() };
  });
}

/**
 * Verifica la sesión Supabase leyendo las cookies correctas (`sb-<ref>-auth-token`
 * y sus chunks) mediante `createServerClient` de `@supabase/ssr`.
 *
 * Es autocontenida: no depende de `next/headers`, por lo que funciona en Route
 * Handlers y en los tests (donde solo hay un objeto `Request`).
 */
async function getSupabaseUser(request: Request) {
  const url = supabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookies(request.headers.get("cookie"));
      },
      setAll() {
        // La escritura de cookies se hace en el proxy (`src/proxy.ts`) y en los
        // Route Handlers de auth; aquí solo leemos.
      },
    },
  });

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Resuelve la identidad autenticada de una petición.
 *
 * Orden de preferencia:
 * 1. Si Supabase Auth está configurado y hay una sesión válida -> supabase.
 * 2. Si NO está configurado y no es producción -> cookie demo (aislada).
 * 3. En producción sin Supabase configurado -> null (fallo seguro).
 */
export async function resolveRequestIdentity(
  request: Request,
): Promise<VerifiedIdentity | null> {
  const production = process.env.NODE_ENV === "production";

  // 1. Supabase Auth (verificación real en servidor). Si hay sesión válida,
  //    es la identidad autoritativa.
  if (isSupabaseConfigured()) {
    const supabaseUser = await getSupabaseUser(request);
    if (supabaseUser) {
      return {
        userId: supabaseUser.id,
        email: supabaseUser.email ?? "",
        provider: "supabase",
      };
    }
  }

  // 2. Demo local (solo no-producción). Se permite aunque Supabase esté
  //    configurado, para no romper el sandbox de desarrollo/demo. En producción
  //    nunca se emite identidad demo.
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

export { type UserRole };