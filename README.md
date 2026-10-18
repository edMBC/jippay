# Jippay

**Agente de pago inteligente para cuentas por pagar B2B.** Jippay lee documentos, aplica reglas deterministas y emite veredictos explicables — `PAGAR`, `ESCALAR` o `FRENAR` — antes de que un humano firme las excepciones. Es una capa de auditoría y gobernanza financiera, **no** una pasarela de pago.

> "La IA lee. El código decide. Tú descansas."

---

## 1. Visión general del producto

Jippay elimina el estrés del cierre de mes en equipos financieros que operan entre **EE. UU. y LATAM**, donde se multiplican proveedores, monedas, formatos y normativas. El sistema:

- **Ingiere a escala** desde Odoo, QuickBooks, a2 ERP, correo IMAP/Google/Microsoft y WhatsApp Business, además de PDFs, imágenes, CSV y fotos de recibos.
- **Decide con un motor determinista** (cero aleatoriedad, cero IA tomando decisiones): calidad documental, lista blanca de proveedores con anti-spoofing, presupuesto, acuerdos comerciales, 3-Way Match y conversión multimoneda transparente.
- **Escala solo las excepciones** a un aprobador autenticado (Human-in-the-Loop) con justificación obligatoria y evidencia de auditoría.
- **Es multi-jurisdiccional**: carga parámetros fiscales por país (EIN, NIT, RUT, RFC, NIF, RIF; factura electrónica; umbrales de retención) y los refleja en la traza de auditoría.
- **Genera pagos estructurados ISO 20022** (`ACCP` / `PDNG` / `RJCT`) sin ejecutar transferencias.

La UX es minimalista tipo iOS/Stripe ("Wow" factor): dark profundo (`#09090b`), tarjetas de cristal translúcidas, acentos esmeralda solo para aprobaciones y ámbar solo para riesgo. El demo es una **keynote escénica autoejecutable** que contrasta una factura limpia (`PAGAR`) contra una factura trampa (`FRENAR`) en menos de 30 segundos, con un módulo **What-If** para alterar parámetros en vivo.

---

## 2. Arquitectura tecnológica

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS |
| Auth | Supabase Auth (`@supabase/ssr`) + sesiones SOX en cookie HttpOnly |
| Base de datos | PostgreSQL (Supabase) con RLS y funciones transaccionales `SECURITY DEFINER` |
| Ledger transaccional | `TransactionalLedger` (in-memory en demo, PostgreSQL en producción) |
| Extracción | Vercel AI SDK + DeepSeek, con fallback determinista (regex/heurísticas) |
| Validación | Zod |

La identidad se resuelve en el servidor (`auth.getUser`), se mapea a una membresía persistente (`company_memberships`) y el proxy (`src/proxy.ts`) protege `/admin` y `/terminal`.

---

## 3. Core de ingeniería financiera

### Motor determinista (`src/lib/engine.ts`)

Evalúa en orden estricto e inflexible:

1. Prompt injection / monto inválido (solo si es fiable) → `FRENAR`
2. Duplicado por hash exacto de archivo → `FRENAR`
3. Calidad documental (confianza ≥ 75% + campos críticos) → `ESCALAR` si insuficiente
4. Duplicado por ID / huella compuesta → `FRENAR`
5. Proveedor no autorizado o spoofing (distancia de Levenshtein) → `FRENAR`
6. Presupuesto insuficiente → `FRENAR`
7. Discrepancia con acuerdo en ERP → `ESCALAR`
8. Supera límite de aprobación automática → `ESCALAR`
9. Legislación fiscal de la jurisdicción (retención, factura electrónica) → `ESCALAR` si aplica
10. Cumplimiento total → `PAGAR`

### 3-Way Match

Cruza **orden de compra (PO) vs. factura vs. recepción** a través de tres señales:
proveedor autorizado (`vendor_match`), acuerdo/SLA (`agreement_match`) y liquidez/deduplicación (`budget_liquidity_match`).

### Ledger transaccional (Regla B)

Los importes se guardan en centavos (enteros). Un único método `commitInvoice` ejecuta idempotencia, deduplicación, bloqueo de fila (`FOR UPDATE`) y reserva/consumo de presupuesto dentro de **una transacción atómica** de PostgreSQL.

### Aprobaciones SOX (Regla C)

Solo `CONTROLLER_APPROVER` firma excepciones, con segregación de funciones (el creador no aprueba su propia factura), justificación obligatoria (10–2000 caracteres) y cadena de auditoría con hash encadenado.

---

## 4. Guía de configuración local

### Requisitos

- Node.js 20+
- pnpm 10+

### Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
# Supabase (públicas — se exponen al navegador)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Supabase (servidor — nunca al navegador)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Ledger transaccional (conexión DIRECTA, puerto 5432, NO el pooler 6543)
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres

# Sesiones SOX (genera un secreto seguro en producción)
SESSION_SECRET=<secreto-largo>

# Opcional
DEEPSEEK_API_KEY=
ALLOW_DEMO_SEED=
```

### Instalación y arranque

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

### Migraciones SQL en Supabase

Aplica el esquema financiero y RLS:

```bash
pnpm db:migrate          # aplica 001 y 002 + verifica el esquema
pnpm db:seed             # aplica migraciones + siembra la empresa demo (solo dev)
```

> `DATABASE_URL` debe ser la conexión **directa** de PostgreSQL (puerto 5432), no el pooler de transacciones Supavisor (6543), porque el ledger usa `SECURITY DEFINER`, `FOR UPDATE` y transacciones multi-sentencia.

Para login real con Supabase Auth, además debes:
1. Crear usuarios en `auth.users`.
2. Provisionar filas en `company_memberships` con `auth_user_id = <user.id>` (el seed demo usa `demo:<email>` y solo sirve para el modo local).

### Tests y calidad

```bash
pnpm test                 # vitest (247 tests)
pnpm exec tsc --noEmit    # typecheck
pnpm lint                 # eslint
pnpm build                # build de producción
pnpm qa                   # smoke test HTTP (requiere servidor en vivo)
```

---

## 5. Estructura del proyecto

```
src/
├── app/                      # App Router (páginas + API)
│   ├── page.tsx              # landing
│   ├── admin/                # centro de control (reglas, ERP, multi-DB)
│   ├── terminal/             # terminal de auditoría (superficie transaccional)
│   ├── demo/                 # keynote escénica + consola de configuración
│   ├── login/ register/ sales/ about/ process/ terms/
│   └── api/
│       ├── auth/             # login, logout, me, register
│       └── finance/          # reserve, approvals, invoices, budget
├── lib/
│   ├── engine.ts             # motor determinista
│   ├── extractor.ts          # extracción IA + fallback determinista
│   ├── multimodal-ingestor.ts# PDF, imágenes, CSV, correo
│   ├── jurisdictions.ts      # legislación fiscal por país
│   ├── finance/              # ledger transaccional + migraciones SQL
│   ├── db/                   # adaptadores (local / Supabase / memory)
│   ├── auth/                 # sesión, roles, identidad, autorización
│   └── supabase/             # clientes SSR (browser/server)
├── components/
│   ├── Navbar.tsx            # navegación + tema
│   ├── SiteFooter.tsx
│   ├── demo/                 # KeynoteDemo, DemoWizard, SourceConfigModal
│   └── ui/                   # IOSGlassCard, IOSStatusBadge, etc.
├── proxy.ts                  # protección de rutas (Next.js 16)
└── middleware/ (deprecado → proxy)
```

---

## Notas de seguridad y alcance

- Jippay **no** es una pasarela de pago, no custodia fondos ni liquida transferencias.
- La IA solo extrae e interpreta; el motor determinista decide. La IA no puede autorizar pagos ni modificar presupuestos.
- El fallback demo está deshabilitado en producción.
- Los valores fiscales por jurisdicción son parámetros de configuración/demo, no asesoría fiscal.