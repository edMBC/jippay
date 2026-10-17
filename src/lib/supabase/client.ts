"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el NAVEGADOR (Client Components).
 *
 * Usa las variables públicas (`NEXT_PUBLIC_*`), que son las únicas que pueden
 * exponerse al navegador. Devuelve `null` cuando no hay configuración, de modo
 * que el flujo de login puede caer de forma segura al modo demo local.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
