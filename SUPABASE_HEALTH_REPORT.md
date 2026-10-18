# Supabase Health Report — Jippay

Fecha: 2026-10-17

Este documento resume el estado de la integración con Supabase (Auth + PostgreSQL)
tras la auditoría y corrección del login, la sesión y la protección de rutas en
Next.js 16 (App Router).

---

## 1. Componentes ajustados

| Componente | Ruta | Estado |
|---|---|---|
| Cliente de navegador | `src/lib/supabase/client.ts` | ✅ `createBrowserClient` con `NEXT_PUBLIC_*` |
| Cliente de servidor | `src/lib/supabase/server.ts` | ✅ `createServerClient` con manejo de cookies |
| Proxy de sesión (edge) | `src/proxy.ts` | ✅ Sustituye al `middleware.ts` deprecado |
| Verificación de identidad | `src/lib/auth/identity.ts` | ✅ Service role + `auth.getUser` |
| Mapeo de membresía | `src/app/api/auth/me/route.ts` | ✅ Identidad Supabase → membresía persistente |
| Login / logout | `src/lib/store.tsx` | ✅ Supabase Auth + fallback demo |
| Login UI | `src/app/login/page.tsx` | ✅ Redirige a `/admin` tras éxito |
| Migración RLS | `src/lib/finance/migrations/002_rls_and_membership_auth.sql` | ✅ `auth.uid()::text` (fix 42883) |

---

## 2. Flujo de autenticación

### Navegador (login)
1. `store.login()` llama a `createSupabaseBrowserClient().auth.signInWithPassword()`.
2. Si Supabase no está configurado o falla, cae al fallback demo (`/api/auth/login`).
3. Tras el login exitoso, `/api/auth/me` resuelve la identidad y la membresía, y
   la UI redirige a `/admin`.

### Servidor / proxy (rutas protegidas)
1. `src/proxy.ts` refresca la sesión Supabase (`supabase.auth.getUser()`).
2. `/admin` y `/terminal` redirigen a `/login` si no hay usuario.
3. `/login` y `/register` redirigen a `/admin` si ya hay usuario (sin bucles).

### Autorización financiera
- Las Route Handlers (`/api/finance/*`) ejecutan `authorizeWithMembership`, que
  verifica la identidad Supabase y la membresía persistente (`auth_user_id`).

---

## 3. Variables de entorno obligatorias

### Navegador (públicas)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Servidor (nunca expuestas al navegador)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (verificación de sesión con `auth.getUser`)
- `SUPABASE_ANON_KEY` (opcional; solo si el proxy usa anon en lugar de service role)

### Ledger transaccional
- `DATABASE_URL` — conexión **directa** de PostgreSQL (puerto 5432), **no** el
  pooler de transacciones Supavisor (puerto 6543).

### Sesiones SOX (cookie HttpOnly)
- `SESSION_SECRET` — en producción debe ser un secreto seguro (nunca el demo).

---

## 4. Validaciones que faltaban (ya corregidas)

1. **Comparación `text = uuid` en RLS** → `auth.uid()::text` en
   `jippay_has_membership`, `jippay_has_role` y la política `memberships_select`.
   La columna `auth_user_id` es `TEXT` (soporta `demo:<email>` y `uuid`).

2. **Clientes SSR vs browser** → separados en `client.ts` (browser) y
   `server.ts` (server) con `@supabase/ssr`.

3. **Deprecación de `middleware.ts`** → migrado a `src/proxy.ts` (Next.js 16).

4. **Unhandled rejections en auth** → todos los callbacks de `store.tsx` envueltos
   en `try/catch`.

5. **Redirección post-login** → `/admin` (antes `/terminal`).

---

## 5. Validaciones pendientes en Supabase (acciones del operador)

Para que el login de Supabase funcione de punta a punta en producción, además del
código, se requiere en el proyecto Supabase:

1. Aplicar las migraciones SQL:
   - `src/lib/finance/migrations/001_initial_financial_schema.sql`
   - `src/lib/finance/migrations/002_rls_and_membership_auth.sql`
   (o ejecutar `pnpm db:migrate`).

2. Crear usuarios reales en `auth.users` (Supabase Auth).

3. Provisionar membresías en `company_memberships` con `auth_user_id` igual al
   `user.id` de Supabase (no `demo:<email>`). El seed demo solo sirve para el
   modo demo local.

4. Configurar las variables de entorno de la sección 3 en Vercel.

---

## 6. Verificación

| Comando | Resultado |
|---|---|
| `pnpm exec tsc --noEmit` | 0 errores |
| `pnpm lint` | 0 errores/warnings |
| `pnpm test` | 247 passed / 1 skipped |
| `pnpm build` | 28 rutas OK (sin warning de deprecación) |

---

## 7. Nota de seguridad

- La `SUPABASE_SERVICE_ROLE_KEY` **nunca** debe exponerse al navegador (solo
  variables `NEXT_PUBLIC_*` se incluyen en el bundle cliente).
- El fallback demo (`demo:<email>`) está deshabilitado en producción: el proxy y
  `authorizeWithMembership` deniegan la identidad demo cuando `NODE_ENV === production`.
