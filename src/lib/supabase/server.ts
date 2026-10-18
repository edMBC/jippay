import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para el SERVIDOR (Server Components, Route Handlers y
 * Server Actions). Gestiona las cookies de sesión de forma correcta en el
 * entorno Node de Next.js App Router.
 *
 * Devuelve `null` cuando no hay configuración para que el flujo caiga al modo
 * demo local de forma segura.
 */
export async function createSupabaseServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: puede lanzar si intenta escribir
          // cookies durante el renderizado. Se ignora (las cookies se fijan en
          // las Route Handlers o en el middleware).
        }
      },
    },
  });
}
