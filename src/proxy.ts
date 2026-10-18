import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy de sesión (Edge runtime). Sustituye al antiguo "middleware" en Next.js 16.
 *
 * - Refresca la sesión de Supabase Auth (si está configurada).
 * - Protege las rutas del panel (/admin, /terminal) redirigiendo a /login
 *   cuando no hay usuario autenticado.
 * - Evita el bucle de redirección: un usuario autenticado que visita /login
 *   es redirigido a /admin.
 *
 * Cuando Supabase NO está configurado (desarrollo/demo), el proxy no interviene:
 * la autorización se resuelve en las Route Handlers (Node runtime).
 */

const PROTECTED_PREFIXES = ["/admin", "/terminal"];
const DEMO_SESSION_COOKIE = "jippay_session";

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Presencia de la cookie demo firmada (señal blanda; la validación real ocurre en el servidor). */
function hasDemoSession(request: NextRequest): boolean {
  return Boolean(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === "production";

  // Sin Supabase configurado: no hay sesión real que refrescar/proteger en Edge.
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresca la sesión y valida al usuario.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // En no-producción, la cookie demo es una señal válida de sesión (el servidor
  // la valida de nuevo). En producción la identidad demo nunca cuenta.
  const demoAuthenticated = !isProduction && hasDemoSession(request);
  const authenticated = Boolean(user) || demoAuthenticated;

  // Usuario autenticado que visita /login o /register: ir al panel (evita bucles).
  if (authenticated && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Ruta protegida sin sesión: redirigir a /login.
  if (!authenticated && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Público, API o sin protección: continuar con las cookies refrescadas.
  return response;
}

export const config = {
  matcher: [
    /*
     * Ejecuta el proxy en todas las rutas salvo los estáticos de Next y los
     * recursos públicos (imágenes, fuentes, manifest, service worker, iconos).
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|sample-files/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
