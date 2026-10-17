# QA_MORNING_CERTIFICATE — Jippay v2.0

Generado automáticamente: 2026-10-17T03:47:16.625Z
Servidor verificado: http://localhost:3000

## Resultado global

- HTTP checks: **12/12 OK**
- Tests Vitest: **86/86 en verde** (2 archivos)
- `npx tsc --noEmit`: **0 errores**
- `pnpm lint`: **0 errores, 0 warnings**
- `pnpm build`: **exit code 0** (producción Next.js)

## Matriz de endpoints HTTP

| # | Check | Método | Ruta | Status | Resultado | Detalle |
|---|-------|--------|------|--------|-----------|---------|
| 1 | GET / (contiene "Decide con Código") | GET | `/` | 200 | ✅ | OK |
| 2 | GET /admin (contiene "Reglas") | GET | `/admin` | 200 | ✅ | OK |
| 3 | GET /terminal (contiene "Terminal") | GET | `/terminal` | 200 | ✅ | OK |
| 4 | GET /manifest.webmanifest (contiene "standalone") | GET | `/manifest.webmanifest` | 200 | ✅ | OK |
| 5 | GET /api/db-health (contiene "adaptadores") | GET | `/api/db-health` | 200 | ✅ | OK |
| 6 | POST /api/process-invoice (veredicto PAGAR) | POST | `/api/process-invoice` | 200 | ✅ | estado=PAGAR (esperado PAGAR) |
| 7 | POST /api/process-invoice (veredicto ESCALAR) | POST | `/api/process-invoice` | 200 | ✅ | estado=ESCALAR (esperado ESCALAR) |
| 8 | POST /api/process-invoice (veredicto FRENAR) | POST | `/api/process-invoice` | 200 | ✅ | estado=FRENAR (esperado FRENAR) |
| 9 | POST /api/process-invoice (payload corrupto -> 400) | POST | `/api/process-invoice` | 400 | ✅ | status=400 |
| 10 | POST /api/ingest-file (INV-204_DevCorp_450_USD.pdf) | POST | `/api/ingest-file` | 200 | ✅ | 200: fileHash=true, decision=true |
| 11 | POST /api/ingest-file (INV-301_LatamDesign_1850_USD.png) | POST | `/api/ingest-file` | 200 | ✅ | 200: fileHash=true, decision=true |
| 12 | POST /api/erp-sync (plantilla Odoo) | POST | `/api/erp-sync` | 200 | ✅ | updatedProviders=4 |

## Cobertura de caminos lógicos (Vitest)

| Camino | Descripción | Estado |
|--------|-------------|--------|
| 1. Factura válida USD → PAGAR | — | ✅ |
| 2. Multimoneda (COP/MXN/BRL/ARS/EUR) → USD | — | ✅ |
| 3. Duplicado por ID → FRENAR | — | ✅ |
| 4. Duplicado por hash SHA-256 / huella compuesta → FRENAR | — | ✅ |
| 5. Proveedor no autorizado → FRENAR | — | ✅ |
| 6. Spoofing (DevC0rp / LatamDes1gn) → FRENAR | — | ✅ |
| 7. Presupuesto insuficiente → FRENAR | — | ✅ |
| 8. Discrepancia con acuerdo ERP → ESCALAR | — | ✅ |
| 9. Supera límite automático → ESCALAR | — | ✅ |
| 10. Prompt injection → FRENAR | — | ✅ |
| 11. Invariante de lote (25+ facturas) → 0 pagos fuera de reglas | — | ✅ |

## Servidor en vivo

El servidor de producción quedó corriendo en `http://localhost:3000`.

### Guía rápida

1. Abre `http://localhost:3000` para el pitch interactivo.
2. Abre `http://localhost:3000/admin` para reglas, ERP/CSV y Multi-DB.
3. Abre `http://localhost:3000/terminal` para la terminal multimodal de auditoría.