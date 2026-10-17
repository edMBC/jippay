# Jippay — Informe Técnico de Estado Actual y Transferencia de Contexto

> Documento generado por auditoría de solo lectura el 2026-10-17.
> No se modificó código, no se ejecutaron migraciones, no se instalaron dependencias, no se desplegó y no se alteró el ledger ni ningún dato financiero.

---

## A. Resumen ejecutivo

**Jippay** es un agente neuro-simbólico de cuentas por pagar (Accounts Payable). Su propuesta de valor central es:

> **La IA interpreta las facturas; el motor determinista protege las decisiones financieras.**

- La IA (DeepSeek, vía Vercel AI SDK) extrae y estructura información documental; **nunca** autoriza pagos ni modifica presupuestos.
- Un motor determinista en TypeScript valida reglas de negocio y emite el veredicto (`PAGAR` / `ESCALAR` / `FRENAR`).
- Una capa financiera transaccional (ledger) gestiona presupuesto, reservas, deduplicación, idempotencia y aprobación humana.

El proyecto está **funcionalmente completo como demo B2B SaaS** con frontend coherente, pero **no está verificado contra infraestructura real** (Supabase Auth + PostgreSQL + RLS no se han probado end-to-end). En producción debe permanecer bloqueado para operaciones financieras reales.

---

## B. Estado de Git y configuración técnica

### Git
- Rama actual: `main`.
- Working tree: **limpio** (`nothing to commit, working tree clean`).
- Commits (más reciente primero):
  1. `da80e86` — "Version 1.1 Leader GPT" (consolida Prompts 03 → 08; +6 224 / −273 líneas, 43 archivos).
  2. `97ab9a7` — "Version 1.0 Reglas de Negocio".
  3. `6a4b636` — "Initial commit from Create Next App".

### Herramientas y dependencias
- Node.js `v22.21.0`, pnpm `10.33.2`.
- Next.js `16.4.2` (App Router + Turbopack; `cacheComponents: true`, `partialPrefetching: true`).
- React `19.3.0`, TypeScript `^5`, Zod `^4.6.7`, Tailwind CSS `4`, `lucide-react`.
- `pg` `^8.23.1` (+ `@types/pg`), `@supabase/supabase-js` `^2.118.0`.
- `@ai-sdk/openai` + `ai` (Vercel AI SDK) para DeepSeek.
- Vitest `^5.0.5` para pruebas.

### Scripts (`package.json`)
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "qa": "tsx scripts/run-qa-smoke.ts"
}
```

### Variables de entorno requeridas (solo nombres, sin valores)
- `DEEPSEEK_API_KEY` — extractor LLM (opcional; sin ella usa fallback determinista).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — públicas.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **solo servidor**, verificación Supabase Auth.
- `DATABASE_URL` — ledger PostgreSQL transaccional (sin ella: ledger en memoria demo).
- `TEST_DATABASE_URL` — base desechable para pruebas de concurrencia real (no configurada).
- `SESSION_SECRET` — firma de cookie demo (en producción no puede ser el secreto demo).
- `ALLOW_DEMO_SEED` — `"false"` desactiva la siembra demo.
- `BASE_URL` — para `scripts/run-qa-smoke.ts`.

### Ledger local
`.data/jippay-ledger.json` está vacío (`[]`, 2 bytes). **Confirmado vacío en el checkpoint base**; no hay evidencia de pérdida de datos.

### Migraciones SQL
- `src/lib/finance/migrations/001_initial_financial_schema.sql` — esquema financiero + funciones `jippay_commit_invoice`, `jippay_release_reservation`, `jippay_consume_reservation`, `jippay_resolve_approval`.
- `src/lib/finance/migrations/002_rls_and_membership_auth.sql` — RLS + políticas por membresía/rol.
- **Estado: NO aplicadas a un PostgreSQL real** (sin `DATABASE_URL`/`TEST_DATABASE_URL` verificado).

---

## C. Mapa de archivos y arquitectura

### Motor determinista y reglas
- `src/lib/engine.ts` — `evaluateInvoice`, `evaluateDocumentQuality`, `computeThreeWayMatch`, `isDocumentQualityRule`, `DOCUMENT_QUALITY_RULES`. **Puro y sin efectos secundarios.**

### Esquemas y modelos
- `src/lib/schemas.ts` — Zod: `InvoiceSchema`, `CriticalFieldsSchema`, `CompanyRulesSchema`, `AgentDecisionSchema`, `ThreeWayMatchSchema`, `ISO20022_STATUS_MAP`.
- `src/lib/finance/model.ts` — tipos financieros: `Company`, `CompanyMembership`, `BudgetPeriod`, `BudgetReservation`, `InvoiceRecord`, `IdempotencyRecord`, `FinancialEvent`, `ApprovalRecord`, `LedgerCapabilities`, `APPROVABLE_EXCEPTION_RULES`.

### Extracción
- `src/lib/extractor.ts` — `extractInvoiceFromText` (DeepSeek + fallback), `buildAgentSystemPrompt`, `deterministicExtract`, `computeCriticalFields`, `computeConfidenceScore`, `finalizeDeterministicExtraction`.

### Ingesta multimodal
- `src/lib/multimodal-ingestor.ts` — PDF (sin deps), PNG (chunks tEXt/iTXt/zTXt), SVG (XML), texto/CSV/JSON/EML; `ingestFile`, `unprocessableInvoice` (documento no procesable → revisión, nunca factura ficticia).

### Seguridad y FX
- `src/lib/security.ts` — `sha256Hex` (puro JS), `detectPromptInjection`, `sanitizeInvoiceInput`, `detectVendorSpoofing` (Levenshtein), `normalizeInvoiceId`, `compositeFingerprint`, `convertToUsd` (tabla `FX_RATES_TO_USD` estática).

### Persistencia y ledger
- `src/lib/db/adapters.ts` — `LocalFileDB` (`.data/` + `/tmp` en Vercel + memoria), `SupabasePostgresAdapter` (PostgREST), `MemoryEdgeAdapter` (localStorage).
- `src/lib/finance/ledger.ts` — interfaz `TransactionalLedger`, `CommitInvoiceRequest/Result`, `ApprovalRequest/Result`, `AsyncMutex`.
- `src/lib/finance/in-memory-ledger.ts` — ledger demo (mutex de un proceso, `productionSafe:false`).
- `src/lib/finance/postgres-ledger.ts` — ledger PostgreSQL real (funciones SQL atómicas, `productionSafe` tras `verify()`).
- `src/lib/finance/factory.ts` — `getTransactionalLedger()`, `getLedgerCapabilities()`.
- `src/lib/finance/demo-seed.ts` — siembra demo (no en producción).

### Orquestación y aprobación
- `src/lib/finance/orchestrator.ts` — `commitInvoiceTransaction`, `reservationKindFor`, `commercialIdFor`, `requestContentHash`, `rulesFingerprintFor`.
- `src/lib/finance/approval-audit.ts` — `canonicalApprovalPayload`, `computeApprovalAuditHash`, `verifyApprovalAuditHash`.
- `src/lib/finance/company-context.ts` — `resolveCompanyContext`.

### Autenticación y autorización
- `src/lib/auth/session.ts` — sesiones demo firmadas (cookie HttpOnly).
- `src/lib/auth/roles.ts` — `UserRole`, `SessionUser`, `ROLE_LABELS`, `ROLE_OPTIONS`.
- `src/lib/auth/authorize.ts` — `authorize`, `authorizeWithMembership`, `deniedResponse`.
- `src/lib/auth/identity.ts` — `resolveRequestIdentity` (Supabase Auth `auth.getUser` o demo).

### Rutas API (`src/app/api/`)
- `auth/login`, `auth/register`, `auth/logout`, `auth/me`.
- `finance/reserve` (texto/lote/archivo), `finance/approvals`, `finance/invoices`, `finance/budget`.
- `process-invoice`, `ingest-file` (legacy, no autoridad financiera), `erp-sync`, `sales-lead`, `db-health`, `agent-status`.

### Store y frontend
- `src/lib/store.tsx` — `StoreProvider`/`useStore`; `processText`, `processFile`, `processBatch` → `/api/finance/reserve`; `submitApproval` → `/api/finance/approvals`; `hydrateFinancials`; `budget`/`demoMode`.
- `src/components/` — `Navbar.tsx` (tema + motor IA + selector SOX + bottom tab móvil), `ui/` (`IOSGlassCard`, `IOSStatusBadge`, `IOSSlideDrawer`, `IOSSegmentedControl`, `IOSMetricRing`), `ServiceWorkerRegister.tsx`.
- Páginas: `/` (landing), `/sales`, `/login`, `/register`, `/admin`, `/terminal`.

### PWA
- `public/sw.js` — Service Worker que excluye `/api/*` del caché.

### Pruebas (`src/lib/__tests__/`)
- `jippay.test.ts`, `enterprise.test.ts`, `security-erp-multimodal.test.ts`, `quality-control.test.ts`, `document-integrity.test.ts`, `auth-routes.test.ts`, `transactional-ledger.test.ts`, `approval-flow.test.ts`, `end-to-end-finance.test.ts`, `identity-membership.test.ts`.

---

## D. Historial de cambios y estado de los prompts anteriores

### Prompt 02 — Autenticación y autorización server-side
- **Objetivo**: proteger rutas mutables con cookie firmada.
- **Estado**: IMPLEMENTADO. `session.ts` firma cookies (HttpOnly, `Secure` en prod); `authorize.ts` centraliza denegación por defecto; rutas `process-invoice`, `ingest-file`, `erp-sync` protegidas.
- **Pruebas**: `auth-routes.test.ts`.
- **Nota posterior**: Prompt 07 añadió `authorizeWithMembership` para membresías reales; las rutas financieras migraron a este mecanismo.

### Prompt 03 — Calidad documental (umbral 75 %)
- **Objetivo**: impedir autorización automática con confianza < 75, inválida o ambigua.
- **Estado**: IMPLEMENTADO. `computeCriticalFields` (5 campos ponderados), `computeConfidenceScore`, `evaluateDocumentQuality`.
- **Pruebas**: `quality-control.test.ts`.

### Prompt 03.1 — Orden de evaluación e integridad
- **Objetivo**: reordenar reglas (calidad antes que financieras), distinguir importe inválido de desconocido, documento no procesable.
- **Estado**: IMPLEMENTADO. Orden final abajo; `REGLA_DOCUMENTO_NO_PROCESABLE`; `monto_invalido` solo si `monto_reliable !== false`.
- **Pruebas**: `document-integrity.test.ts`.

### Prompt 04 — Ledger transaccional, reservas, dedup, idempotencia
- **Estado**: IMPLEMENTADO en código. Ledger en memoria (mutex) y PostgreSQL (funciones `SECURITY DEFINER` con `FOR UPDATE` + `ON CONFLICT`).
- **Pruebas**: `transactional-ledger.test.ts`.
- **No verificado**: atomicidad multi-instancia real (sin `TEST_DATABASE_URL`).

### Prompt 04.1 — Correcciones de idempotencia e integridad
- **Estado**: IMPLEMENTADO. `requestHash` separado de `rulesFingerprint`; `lookupIdempotency`; `verify()` gatea `productionSafe`.
- **Pruebas**: en `transactional-ledger.test.ts`.

### Prompt 05 — Aprobación humana, justificación, auditoría
- **Estado**: IMPLEMENTADO. `POST /api/finance/approvals`; justificación 10–2000; hash SHA-256 canónico; segregación controller; elegibilidad estricta.
- **Pruebas**: `approval-flow.test.ts`.

### Prompt 06 — Integración end-to-end de la terminal
- **Estado**: IMPLEMENTADO. Terminal usa `/api/finance/reserve` + `/api/finance/invoices` + `/api/finance/budget`; se eliminó el bypass cliente (`applyPaySideEffects`/`recordPaid`).
- **Pruebas**: `end-to-end-finance.test.ts`.

### Prompt 07 — Supabase Auth, membresías y RLS
- **Estado**: IMPLEMENTADO en código (identidad verificada + membresía `auth_user_id` + RLS en SQL). **No verificado contra Supabase/PG real.**
- **Pruebas**: `identity-membership.test.ts` (mock/in-memory).

### Prompt 08 — Polish visual integral
- **Estado**: IMPLEMENTADO (frontend coherente; honestidad en claims de cumplimiento; spinners; rol de autoservicio limitado a auditor).
- **Evidencia**: archivos `login/register/sales/terminal` modificados y consolidados en `da80e86`.

---

## E. Estado de las rutas y frontend

Rutas de página (todas responden 200 en smoke test local):
| Ruta | Funcionalidad | Datos |
|---|---|---|
| `/` | Landing con simulador determinista interactivo + arquitectura neuro-simbólica + Bento grid. | Demo/simulado (determinista real). |
| `/sales` | ROI calculator + matriz de capacidades + plan de precios + lead form (`/api/sales-lead`). | Calculado por inputs; claims de cumplimiento honestos. |
| `/login` | Formulario oscuro + 1-Click SOX Role Sandbox. | Sesión demo. |
| `/register` | Onboarding; rol inicial limitado a `AUDITOR_VIEWER` (CFO/Controller requieren invitación). | Sesión demo. |
| `/admin` | Políticas: presupuesto, proveedores, límite, acuerdos, ERP sync, estado DB. | Config demo (`defaultCompanyRules`); gated por CFO. |
| `/terminal` | **Prioridad**: KPIs, ingesta (texto/archivo/lote), lista de facturas, detalle forense, aprobación humana. | Backend real (`/api/finance/*`). |

Rutas API:
- `POST /api/finance/reserve` (texto `{rawText}`, lote `{batch}`, archivo FormData) — autoritativa.
- `POST /api/finance/approvals` (APPROVE/REJECT + justificación).
- `GET /api/finance/invoices`, `GET /api/finance/budget`.
- `POST /api/auth/login|register|logout`, `GET /api/auth/me`.
- `POST /api/process-invoice`, `POST /api/ingest-file` (legacy, ya no autoridad financiera).
- `POST /api/erp-sync`, `POST /api/sales-lead`, `GET /api/db-health`, `GET /api/agent-status`.

**Responsive/móvil**: existe `Navbar` con bottom tab bar móvil + `env(safe-area-inset-bottom)`; tablas con `overflow-x-auto`. Verificado solo por renderizado HTTP (200), no por inspección visual de viewport.

---

## F. Matriz de reglas de negocio

| Área | Clasificación | Evidencia |
|---|---|---|
| Separación neuro-simbólica | IMPLEMENTADO Y VERIFICADO (unitario) | `extractor.ts` extrae; `engine.ts` decide; `evaluateInvoice` puro. |
| Integridad financiera (montos/seguridad/injection) | IMPLEMENTADO Y VERIFICADO (unitario) | `REGLA_SEGURIDAD_PROMPT_INJECTION`, `REGLA_SEGURIDAD_MONTO_INVALIDO`. |
| Duplicados (ID/hash/comercial/concurrentes) | IMPLEMENTADO (código) / NO VERIFICADO en PG real | `commercialIdFor`, hash en ledger, `ON CONFLICT` en SQL. |
| Proveedores (whitelist/spoofing) | IMPLEMENTADO Y VERIFICADO (unitario) | `REGLA_1_PROVEEDOR`, `REGLA_SPOOFING_VENDOR` (Levenshtein ≤2). |
| Presupuesto (fuente/atomicidad) | IMPLEMENTADO (código) / NO VERIFICADO multi-instancia | `FOR UPDATE` en SQL; mutex en memoria. |
| Confianza documental (75 %) | IMPLEMENTADO Y VERIFICADO (unitario) | `evaluateDocumentQuality`. |
| Aprobación humana | IMPLEMENTADO Y VERIFICADO (in-memory + rutas) | `resolveApproval` + endpoint + justificación. |
| Idempotencia | IMPLEMENTADO Y VERIFICADO (in-memory) | `lookupIdempotency`, `requestContentHash`. |
| Multi-tenancy | IMPLEMENTADO (código) / NO VERIFICADO RLS | `companyId` en todo el ledger; RLS en SQL sin aplicar. |
| Autenticación | PARCIAL (demo verificado; Supabase Auth sin verificar) | `identity.ts` + `session.ts`. |
| RLS | NO VERIFICADO EN INFRAESTRUCTURA REAL | `002_rls_and_membership_auth.sql` existe, no aplicado. |
| Contratos (límites/acuerdos) | IMPLEMENTADO (parcial) | `REGLA_ACUERDO_PREVIO`, `REGLA_3_LIMITE_AUTO`; 3-Way Match en `computeThreeWayMatch`. |
| FX | IMPLEMENTADO (parcial) | `convertToUsd` con tabla estática `FX_RATES_TO_USD` (sin fuente de tasas externa). |
| 3-Way Match | IMPLEMENTADO (parcial) | proveedor + acuerdo + liquidez; **no** hay orden de compra/recepción reales. |
| Anomalías | AUSENTE | No hay detección semántica de incoherencias. |
| OCR | AUSENTE | PDF/PNG/SVG por texto embebido; imágenes sin texto → documento no procesable. |
| Estados financieros | IMPLEMENTADO (semántica clara) | `PAGAR/ESCALAR/FRENAR` ≠ `PENDING_REVIEW/APPROVED_FOR_PAYMENT/REJECTED` ≠ `ACTIVE/RELEASED/CONSUMED` ≠ pago liquidado (no implementado). |

**Orden final de evaluación** (`evaluateInvoice`):
1. Prompt injection / monto inválido (solo si fiable) → `FRENAR`
2. Duplicado por hash exacto de archivo → `FRENAR`
3. Calidad documental → `ESCALAR`
4. Duplicado por ID/huella compuesta (datos ya fiables) → `FRENAR`
5. Proveedor no autorizado / spoofing → `FRENAR`
6. Presupuesto insuficiente → `FRENAR`
7. Discrepancia con acuerdo ERP → `ESCALAR`
8. Supera límite automático → `ESCALAR`
9. Cumplimiento total → `PAGAR`

---

## G. Estado de la infraestructura financiera

- **Modelo del ledger**: `TransactionalLedger` con `commitInvoice`, `lookupIdempotency`, `resolveApproval`, `lookupApproval`, `getInvoice`, `releaseReservation`, `consumeReservation`, `getBudgetSnapshot`, `getCompanyRules`, `getActiveMembershipByAuthUser`, `listInvoices/Reservations/Approvals/Events`, `verify`.
- **Reservas**: `ACTIVE` (reservado/comprometido, no pago) → `RELEASED` (liberado, conserva historial) → `CONSUMED` (contabilizado para factura aprobada, **no** liquidado).
- **Aprobación**: conserva reserva ACTIVA (no consume ni libera); rechazo libera.
- **Idempotencia**: `requestHash` solo de contenido (empresa+fuente+documento); `rulesFingerprint` separado; replay devuelve original; conflicto → 409.
- **Deduplicación**: hash binario (único por empresa), identidad comercial (única por empresa), huella compuesta **no** es restricción única (solo sospechosa).
- **`productionSafe`**: en `PostgresTransactionalLedger` es `false` hasta que `verify()` comprueba conexión + esquema; en memoria siempre `false`.
- **`localStorage`**: solo caché visual/preferencias; **no** es fuente de autoridad financiera.
- **Dependencias**: `DATABASE_URL` (ledger PG), `TEST_DATABASE_URL` (pruebas), `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Auth).

**Garantías en código vs probadas**: atomicidad/RLS/concurrencia multi-instancia están **implementadas en SQL** pero **NO probadas contra PostgreSQL real**.

---

## H. Estado de identidad, membresías y autorización

- **Supabase Auth**: integrado en código (`resolveRequestIdentity` → `auth.getUser`), pero **no verificado** contra infraestructura real.
- **Identidad demo**: cookie firmada local (solo no-producción); **nunca** identidad corporativa real; bloqueada en producción.
- **Membresías**: persistente por `auth_user_id` + `company_id` + `status` (`active`/`inactive`) + `role`. El rol efectivo proviene de la membresía, no del token ni del body.
- **Registro público**: no auto-asigna `CFO_ADMIN`/`CONTROLLER_APPROVER` (403); solo `AUDITOR_VIEWER` por autoservicio.
- **Rutas financieras**: usan `authorizeWithMembership` (identidad + membresía + rol). Rutas legacy (`process-invoice`/`ingest-file`/`erp-sync`) conservan `authorize` demo.
- **Aislamiento**: `companyId` derivado de membresía verificada, nunca de `company_id` del cliente.

---

## I. Pruebas y compilación

Resultados reales ejecutados durante la auditoría (solo lectura):
| Comando | Resultado |
|---|---|
| `pnpm test` | **233 passed / 1 skipped** (10 archivos). El skip es la prueba de PostgreSQL real gated por `TEST_DATABASE_URL`. |
| `pnpm exec tsc --noEmit` | 0 errores (exit 0). |
| `pnpm lint` | 0 errores / 0 warnings (exit 0). |
| `pnpm build` | exit 0; **23 rutas** (6 páginas estáticas + 17 APIs dinámicas). |

Tipos de prueba:
- **Unitarias** (motor, calidad, seguridad, extractor, FX, auditoría hash).
- **In-memory** (ledger, reservas, idempotencia, dedup, concurrencia simulada single-process).
- **Integración contra rutas reales** (auth, aprobación, end-to-end financiero).
- **PostgreSQL real / RLS**: NO ejecutadas (falta `TEST_DATABASE_URL`).

---

## J. Riesgos y deuda técnica

### A. Bloqueos para una demostración
- **Bajo**: el flujo principal (landing → terminal → procesar → aprobar) funciona en demo con ledger en memoria.
- Aprobar excepciones requiere que la factura exista en el ledger (vía `/api/finance/reserve`); la terminal ya está conectada.

### B. Bloqueos para producción financiera (prioridad alta)
1. **Identidad real sin verificar** — Supabase Auth integrado pero no probado end-to-end.
2. **RLS sin aplicar** — la migración 002 existe; no se aplicó ni probó en PG real.
3. **Concurrencia PostgreSQL no verificada** — solo mutex en memoria.
4. **Persistencia durable** — sin `DATABASE_URL`, el ledger es efímero (memoria).
5. **Membresías por `auth_user_id`** — requieren migración aplicada + flujo de provisión/invitación.

### C. Funcionalidades avanzadas pendientes (prioridad baja/media)
- Reconocimiento semántico de proveedores / anomalías.
- 3-Way Match completo con orden de compra y recepción.
- FX con fuentes de tasas externas (hoy tabla estática).
- OCR real para imágenes sin texto.
- Integración bancaria / instrucción de pago / liquidación (fuera de alcance, explícitamente no implementado).

---

## K. Próximas decisiones pendientes (sin implementarlas)

1. Provisionar un entorno Supabase real (Auth + PostgreSQL) y aplicar migraciones 001 y 002.
2. Configurar `TEST_DATABASE_URL` (base desechable) y ejecutar las pruebas de concurrencia/RLS reales.
3. Definir un flujo de **invitación/provisión de membresías** (hoy solo seed demo).
4. Conectar `/admin` a una ruta persistente de reglas/presupuesto del servidor (hoy es config demo local).
5. Decidir OCR real (o documentar el rechazo seguro de imágenes sin texto como comportamiento final).

---

## L. Documento final de transferencia al otro agente

> Copia esta sección a otra conversación/agente. Es autocontenida.

### 1. Qué es Jippay
Agente neuro-simbólico de cuentas por pagar. La IA extrae facturas (DeepSeek o parser determinista); un motor determinista decide; un ledger transaccional gestiona presupuesto/reservas/aprobaciones. Valor: control financiero determinista, explicable y trazable sobre una lectura probabilística.

### 2. Stack tecnológico
Next.js 16.4.2 (App Router, Turbopack), React 19, TypeScript 5, Zod 4, Tailwind CSS 4, lucide-react, Vitest 5, `pg`, `@supabase/supabase-js`, Vercel AI SDK (`ai` + `@ai-sdk/openai`). Node 22, pnpm 10.

### 3. Arquitectura y rutas esenciales
- Motor: `src/lib/engine.ts` (puro).
- Extracción: `src/lib/extractor.ts` + `src/lib/multimodal-ingestor.ts`.
- Ledger: `src/lib/finance/ledger.ts` (interfaz), `in-memory-ledger.ts`, `postgres-ledger.ts`, `factory.ts`, `orchestrator.ts`.
- Auth: `src/lib/auth/{session,roles,authorize,identity}.ts`.
- API financiera: `src/app/api/finance/{reserve,approvals,invoices,budget}/route.ts`.
- Frontend: `src/lib/store.tsx`, `src/components/Navbar.tsx`, páginas en `src/app/{page,sales,login,register,admin,terminal}/page.tsx`.

### 4. Flujo de factura end-to-end
`/terminal` → `POST /api/finance/reserve` (texto/lote/archivo; extracción server-side + sanitización + `evaluateInvoice` + `commitInvoiceTransaction`) → ledger registra factura/reserva → terminal hidrata desde `GET /api/finance/invoices` + `GET /api/finance/budget` → excepción escalada se aprueba/rechaza con `POST /api/finance/approvals` (controller + justificación) → estado `APPROVED_FOR_PAYMENT`/`REJECTED` + reserva `ACTIVE`/`RELEASED`.

### 5. Tres reglas permanentes de negocio
- **Regla A**: IA extrae; motor determinista decide; la IA no autoriza pagos ni modifica presupuestos.
- **Regla B**: una única fuente de verdad financiera por empresa; dedup, reservas y transiciones protegidas frente a concurrencia.
- **Regla C**: confianza < 75 %, inválida o ambigua impide auto-autorización; excepciones requieren aprobador autenticado + justificación + auditoría.

### 6. Funcionalidades implementadas y garantías
Motor determinista (9 reglas), calidad documental (umbral 75), dedup (hash/ID/comercial), presupuesto con reservas atómicas, idempotencia, aprobación humana con hash SHA-256, multi-tenancy por empresa, Supabase Auth + membresías + RLS (en código). **Garantías verificadas**: unitarias + in-memory + integración de rutas. **No verificadas**: PostgreSQL/RLS/concurrencia real.

### 7. Decisiones de arquitectura que no deben deshacerse
- `evaluateInvoice` debe permanecer **puro** (inyección de `now` para prerender).
- No usar `runtime="nodejs"` (incompatible con `cacheComponents`).
- La empresa/rol **nunca** provienen del body/query; solo de identidad+membresía verificada.
- El hash de idempotencia es solo de contenido; `rulesFingerprint` va separado.
- `CONSUMED` = comprometido/contabilizado, **no** pagado/liquidado.
- El ledger en memoria es demo (`productionSafe:false`); el PG es `productionSafe` solo tras `verify()`.

### 8. Estado real de identidad, persistencia y adaptadores
- Identidad: Supabase Auth (código) + demo local (no-prod). Sin infraestructura real → sin verificación end-to-end.
- Persistencia: demo = memoria (`InMemoryTransactionalLedger`); producción = PostgreSQL (`PostgresTransactionalLedger`, requiere `DATABASE_URL` + migraciones aplicadas).
- Adaptadores legacy (`LocalFileDB`, `SupabasePostgresAdapter`, `MemoryEdgeAdapter`) no son autoridad financiera.

### 9. Pruebas y limitaciones
233 passed / 1 skipped (PostgreSQL real gated por `TEST_DATABASE_URL`); tsc 0; lint 0; build 23 rutas. Sin `TEST_DATABASE_URL` no se ha probado concurrencia/RLS real.

### 10. Problemas pendientes (prioridad)
1. Verificar Supabase Auth + aplicar migraciones en PG real.
2. Verificar RLS y concurrencia con `TEST_DATABASE_URL`.
3. Flujo de invitación/provisión de membresías.
4. Persistir reglas/presupuesto del servidor en `/admin`.
5. OCR real (o mantener rechazo seguro de imágenes sin texto).

### 11. Modificaciones no consolidadas en Git
Ninguna. Working tree limpio; todo consolidado en `da80e86`.

### 12. Último punto funcional
Prompt 08 (polish visual) completado. Frontend coherente, terminal integrada con backend, aprobación funcional, Supabase Auth/RLS en código pendientes de verificación real.

### 13. Información que falta para producción
Credenciales Supabase reales, base PostgreSQL (migraciones aplicadas), `TEST_DATABASE_URL` para pruebas de concurrencia, y un flujo de provisión de membresías.

### 14. Recomendación de continuidad
Verificar primero la infraestructura real (Supabase Auth + PostgreSQL + RLS con `TEST_DATABASE_URL`), luego añadir el flujo de invitación de membresías y conectar `/admin` a reglas persistentes del servidor. No iniciar nuevas reglas de negocio hasta cerrar esos dos frentes.
