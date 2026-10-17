# MORNING_AUDIT — Jippay v2.0

Reporte generado automáticamente por el agente autónomo de construcción.
Fecha: 2026-10-17 (UTC).

## Resumen

Proyecto Jippay construido en su totalidad siguiendo la especificación
`NIGHT_AGENT_SPEC.md` y la fuente de verdad visual `Jippay.html`.

- Stack: Next.js 16.4.2 (App Router + Turbopack), TypeScript estricto, Zod 4, Vercel AI SDK, Tailwind CSS 4, Vitest 5.
- Motor determinista puro (sin IA) que decide `PAGAR` / `ESCALAR` / `FRENAR`.
- Extractor neuro-simbólico: DeepSeek (si hay `DEEPSEEK_API_KEY`) con fallback determinista Regex + heurísticas.
- Estado global persistido en `localStorage` sincronizando `/admin` y `/terminal`.
- 33 tests unitarios en verde, tipado sin errores y build de producción exitoso.

## Archivos creados

### Capa de dominio / lógica (`src/lib/`)
| Archivo | Descripción |
| --- | --- |
| `src/lib/schemas.ts` | Esquemas Zod: `InvoiceSchema`, `CompanyRulesSchema`, `AgentDecisionSchema` + tipos inferidos. |
| `src/lib/engine.ts` | Función pura `evaluateInvoice(invoice, rules, processedIds)` con 6 reglas ordenadas y traza paso a paso. |
| `src/lib/mock-data.ts` | `defaultCompanyRules` + `sampleRawInvoices` (12 casos con trampas: duplicados, proveedor no autorizado, presupuesto, acuerdo, monedas, formatos). |
| `src/lib/extractor.ts` | `extractInvoiceFromText` (DeepSeek + fallback determinista) y `deterministicExtract`. |
| `src/lib/store.tsx` | Context React con persistencia en `localStorage` y acciones de procesamiento/aprobación. |

### Tests
| Archivo | Descripción |
| --- | --- |
| `src/lib/__tests__/jippay.test.ts` | 33 tests de Vitest sobre esquemas, motor, extractor y seguridad del lote completo. |

### API y UI
| Archivo | Descripción |
| --- | --- |
| `src/app/api/process-invoice/route.ts` | Endpoint `POST` que extrae, valida con Zod y evalúa la decisión. |
| `src/components/Navbar.tsx` | Barra superior compartida con indicadores en vivo y navegación. |
| `src/app/page.tsx` | Landing page (hero, diagrama de los dos dominios, métricas, CTAs). |
| `src/app/admin/page.tsx` | Panel de reglas: sliders, whitelist, acuerdos y reset. |
| `src/app/terminal/page.tsx` | Terminal: ingesta + casos trampa, inspector JSON y log de auditoría filtrable. |
| `src/app/layout.tsx` | Layout raíz con fuentes Inter + JetBrains Mono y `StoreProvider`. |
| `src/app/globals.css` | Tema oscuro institucional (`zinc-950` / `zinc-900` / `zinc-800`). |

## Resultado de pruebas (`pnpm vitest run`)

```
RUN  v5.0.5 D:/Proyectos/jippay

 Test Files  1 passed (1)
      Tests  33 passed (33)
   Start at  23:13:05
   Duration  1.05s
```

Cobertura de los tests:
- Validación de `InvoiceSchema` (montos positivos, fechas `YYYY-MM-DD`, moneda por defecto, campo opcional).
- Validación de `CompanyRulesSchema` y `AgentDecisionSchema`.
- Regla 0 (duplicados, incluyendo mayúsculas/espacios).
- Regla 1 (whitelist de proveedores, case-insensitive + trim).
- Regla 2 (presupuesto insuficiente).
- Regla 2.5 (desviación del acuerdo, por `monto_acordado` y por `acuerdos_por_proveedor`).
- Regla 3 (límite de aprobación automática).
- Prioridad estricta de reglas.
- Extractor determinista (monedas COP/MXN convertidas a USD, formato numérico europeo, fechas `DD/MM/YYYY`, montos en palabras, normalización de proveedores).
- Seguridad: el lote completo nunca aprueba pagos fuera de reglas.

## Resultado de tipado y build

`npx tsc --noEmit` → exit code 0 (sin errores).

`pnpm lint` → exit code 0 (sin errores ni warnings).

`pnpm build` → exit code 0:

```
▲ Next.js 16.4.2 (Turbopack)
✓ Compiled successfully in 24.5s
  Running TypeScript ...
  Finished TypeScript in 6.7s ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /admin
├ ƒ /api/process-invoice
└ ○ /terminal

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

## Smoke test del endpoint (servidor de producción)

`POST /api/process-invoice` con una factura válida de DevCorp ($450 USD) respondió
correctamente con estado `PAGAR`, regla `APROBACION_AUTOMATICA` y saldo restante `$4550`.
Un segundo envío con `processedIds: ["INV-204"]` respondió `FRENAR` con
`REGLA_0_DUPLICADA`, confirmando la detección de cobros duplicados de extremo a extremo.

## Guía de 3 pasos para probar la interfaz al despertar

1. **Levantar el entorno:** ejecuta `pnpm dev` y abre `http://localhost:3000`.
2. **Configurar reglas:** ve a `http://localhost:3000/admin`, ajusta el límite
   automático y el presupuesto, añade/elimina proveedores y prueba "Resetear Demo".
3. **Auditar facturas:** ve a `http://localhost:3000/terminal`, pulsa
   "Ejecutar Stress Test (Lote Completo)" o carga casos individuales, inspecciona el
   JSON extraído y aprueba/rechaza las facturas en estado `ESCALAR` desde el log.

> Nota: para usar la ruta de IA real, define `DEEPSEEK_API_KEY` en `.env.local`.
> Sin esa variable, el sistema usa automáticamente el parser determinista.
