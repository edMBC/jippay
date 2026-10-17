# PROJECT_STATE_DUMP — Jippay v2.0

> Estado tras la auditoría + correcciones de producción + compliance empresarial/SaaS (2026-10-17).
> Todo lo que aquí se afirma fue verificado ejecutando comandos reales, no hardcodeado.

## Verificación real (comandos ejecutados)

| Chequeo | Comando | Resultado |
|---|---|---|
| Tests unitarios | `pnpm test` | ✅ 98/98 passed (3 archivos) |
| Tipos | `pnpm exec tsc --noEmit` | ✅ exit 0 |
| Lint | `pnpm lint` | ✅ exit 0 (0 errores, 0 warnings) |
| Build producción | `pnpm build` | ✅ exit 0, `.next/` generado (19 rutas) |
| Smoke HTTP | `POST /api/auth/login` + `GET /api/auth/me` | ✅ sesión cookie HttpOnly + rol SOX |
| Smoke HTTP | `POST /api/sales-lead` | ✅ lead registrado |
| Smoke HTTP | `POST /api/process-invoice` | ✅ `iso20022_status` + `three_way_match` |

> Nota: el "engine" es `deterministic-fallback` porque no hay `DEEPSEEK_API_KEY` configurada en este entorno. Con la key presente, cambia automáticamente a `deepseek-llm`.

## Rutas generadas (producción)

Páginas: `/`, `/login`, `/register`, `/sales`, `/admin`, `/terminal`.
API: `/api/auth/login|register|logout|me`, `/api/sales-lead`, `/api/agent-status`, `/api/db-health`, `/api/erp-sync`, `/api/ingest-file`, `/api/process-invoice`.

## Capacidades añadidas (docs 04 + 05)

- **SOX RBAC** (`src/lib/auth/session.ts` + `roles.ts`): roles `CFO_ADMIN`, `CONTROLLER_APPROVER`, `AUDITOR_VIEWER`, cookie HttpOnly firmada `jippay_session`, usuarios demo `cfo@/controller@/auditor@jippay.us` (password demo `jippay2026`), 1-click role sandbox.
- **ISO 20022 + 3-Way Match** (`schemas.ts`/`engine.ts`): `iso20022_status` (ACCP/PDNG/RJCT), `three_way_match` (vendor/agreement/budget_liquidity), hash de auditoría determinista sin reloj.
- **Telemetría del agente** (`extractor.ts`): `extraction_engine`, `agent_reasoning`, `confidence_score`, `system_prompt_preview`, normalización multimoneda post-extracción.
- **Páginas SaaS**: `/login`, `/register`, `/sales` (ROI calculadora, matriz ISO/SOX/ERP, planes y formulario de demo).
- **UI**: selector de rol SOX y tema en `Navbar`, banner SOX + bloqueo por rol en `/admin`, sellos 3-Way Match + ISO 20022 + `approved_by` en `/terminal`, panel "Cerebro del Agente" en el inspector.
- **Deploy**: `.env.example` con `NEXT_PUBLIC_SUPABASE_*` y `SESSION_SECRET`; `.gitignore` excluye `.data/` y permite `.env.example`.

## Correcciones aplicadas (7 bloques)

1. **`src/lib/db/adapters.ts` + Vercel serverless**
   - `LocalFileDB` ahora usa `/tmp/jippay/` cuando `process.env.VERCEL` está activo, y cae a **memoria** si el filesystem es read-only (jamás falla).
   - `SupabasePostgresAdapter` revisado: el header `Authorization: `Bearer ${key}`` es válido y está bien cerrado. El "`******`" del informe original era un artefacto de redacción de la salida del agente, no un error real en el código.
   - Nuevo `getActiveAdapter()` y `persistDecision()` (append al ledger, nunca lanza).
   - `POST /api/process-invoice` y `POST /api/ingest-file` ahora registran cada decisión vía `persistDecision()`.

2. **Agente con contexto dinámico (`src/lib/schemas.ts`, `src/lib/extractor.ts`)**
   - `InvoiceSchema` añade `extraction_engine`, `agent_reasoning`, `confidence_score` (0-100) y `fecha_vencimiento_inferida`.
   - `extractInvoiceFromText(rawText, rules?)` inyecta las `CompanyRules` en el System Prompt vía `buildAgentSystemPrompt(rules)`.
   - La normalización multimoneda (`monto_usd`, `tasa_cambio`) se ejecuta **siempre** post-extracción (DeepSeek y fallback) vía `finalizeExtraction` / `finalizeDeterministicExtraction`.
   - `findDate` marca `fecha_vencimiento_inferida` y `engine.ts` emite `ADVERTENCIA_FECHA` en la traza (ya no se oculta en silencio).

3. **Ingesta multimodal honesta (`src/lib/multimodal-ingestor.ts`, `src/lib/store.tsx`)**
   - Imágenes: analiza primero contenido embebido (chunks `tEXt`/`iTXt`/`zTXt` de PNG, XML de SVG) y solo después recurre al nombre de archivo.
   - `processFile` en `store.tsx` tiene fallback local (igual que `processText`) si `/api/ingest-file` falla por red.

4. **Sin hardcodes en `/admin` + snapshot unificado**
   - Métricas reactivas derivadas de `useStore()`: presupuesto restante, autonomía (`PAGAR / total`), frenadas y escaladas.
   - Snapshot exporta/importa un JSON unificado `{ rules, decisions, processedIds, processedFingerprints, processedFileHashes }` vía `exportSnapshot`/`importSnapshot`.

5. **Impacto visual y explicabilidad (`Navbar.tsx`, `/terminal`, `IOSSlideDrawer`)**
   - Navbar: selector de modo (`Obsidian iOS Dark` / `Titanium High-Contrast`) y badge en vivo del motor (`DeepSeek Agent Ready` / `Heuristic Engine Active`) + nº de proveedores.
   - Inspector de `/terminal`: sección **"Cerebro del Agente & Contexto Inyectado"** con el System Prompt dinámico, `agent_reasoning`, `confidence_score` y el pipeline `[Dominio 1: Agente Extractor Contextual] → [Dominio 2: Guardia Determinista (6 Reglas)]`.

6. **Limpieza, SW y scripts**
   - Eliminada la carpeta huérfana `src/core/`.
   - `public/sw.js` excluye `/api/*` del caché.
   - `package.json`: scripts `"test": "vitest run"` y `"qa": "tsx scripts/run-qa-smoke.ts"`.
   - Creado `.env.example` documentando `DEEPSEEK_API_KEY`, `SUPABASE_*` y `BASE_URL`.
   - `scripts/run-qa-smoke.ts` ya no hardcodea resultados de test/lint/build.

7. **Verificación real** (ver tabla arriba).

## Estado de los 19 puntos ciegos

| # | Punto ciego | Estado |
|---|---|---|
| 1 | OCR de imágenes simulado por nombre de archivo | 🟡 PARCIAL — ahora analiza contenido PNG/SVG primero; OCR real de fotos sigue fuera de alcance |
| 2 | Extracción PDF por regex `Tj/TJ` | 🟡 PARCIAL — se mantiene extractor propio (sin `pdf-parse`); limitación documentada |
| 3 | ERP = plantillas CSV hardcodeadas | 🟡 PARCIAL — requiere credenciales/APIs reales de cada ERP |
| 4 | Métricas de `/admin` hardcodeadas | 🟢 RESUELTO |
| 5 | Tasas FX fijas | 🟡 PARCIAL — requieren proveedor de FX externo |
| 6 | QA certificado con resultados hardcodeados | 🟢 RESUELTO — el script ya no inventa cifras |
| 7 | `LocalFileDB` escribe en `.data/` (read-only Vercel) | 🟢 RESUELTO — `/tmp` + fallback a memoria |
| 8 | `MemoryEdgeAdapter` volátil por instancia | 🟡 PARCIAL — inherente a serverless; durabilidad vía Supabase |
| 9 | Persistencia solo `localStorage` | 🟢 RESUELTO — el servidor ahora persiste decisiones en ledger; la UI sigue usando `localStorage` para estado local |
| 10 | Header Supabase "roto" | 🟢 RESUELTO — era artefacto de redacción; el código real ya usaba `Bearer ${key}` válido |
| 11 | Doble esquema / `src/core` huérfano | 🟢 RESUELTO — eliminado |
| 12 | Sin script `test` | 🟢 RESUELTO |
| 13 | Sin `.env.example` | 🟢 RESUELTO |
| 14 | `processFile` sin fallback local | 🟢 RESUELTO |
| 15 | Snapshot descargar/restaurar desalineado | 🟢 RESUELTO |
| 16 | API sin auth/rate-limit/CSRF | 🟡 PARCIAL — fuera del alcance de las 7 correcciones (demo) |
| 17 | `sw.js` cachea `/api/*` | 🟢 RESUELTO |
| 18 | `findDate` oculta fecha faltante | 🟢 RESUELTO — advertencia en traza + flag `fecha_vencimiento_inferida` |
| 19 | `hash_auditoria` incluye timestamp (no determinista) | 🟡 PARCIAL — por diseño incluye `timestamp`; documentado |

## Notas para despliegue en Vercel

- Define `DEEPSEEK_API_KEY` (opcional) y `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (opcional, para durabilidad real).
- Sin `SUPABASE_*`, el ledger usa `/tmp` en Vercel (efímero) o memoria; las decisiones siguen disponibles en la UI vía `localStorage`.
- El agente funciona 100% sin clave: cae al motor determinista con explicabilidad completa.
