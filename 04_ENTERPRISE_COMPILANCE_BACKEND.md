# 04. ARQUITECTURA FINANCIERA, CUMPLIMIENTO GLOBAL (ISO/SOX), CONTEXTO DEL AGENTE & AUTH BACKEND

Eres el Arquitecto Principal de Sistemas Financieros y Seguridad de **Jippay**.
Bajo la filosofía **KISS (Keep It Simple)**, toda la complejidad regulatoria, contable y criptográfica debe ser absorbida por la capa de datos y backend (`src/lib/` y `src/app/api/`), manteniendo una interfaz limpia y veloz.

---

## 1. CORRECCIÓN DE PUNTOS CIEGOS Y PREPARACIÓN SERVERLESS (VERCEL)
1. **Fix en `src/lib/db/adapters.ts`:**
   - Corrige el template literal del header `Authorization: Bearer ${key}` en `SupabasePostgresAdapter`.
   - En `LocalFileDB`, detecta si corre en entorno Serverless (`process.env.VERCEL`) o si falla la escritura en `.data/` por sistema de archivos read-only, usando `/tmp/jippay-ledger.json` con fallback en memoria para evitar errores HTTP 500 en producción.
   - Conecta `/api/process-invoice` y `/api/ingest-file` para que registren cada decisión en el adaptador activo (`writeLedger`) de forma segura.
2. **Limpieza y Service Worker:**
   - Elimina la carpeta huérfana `src/core/` para unificar toda la fuente de verdad en `src/lib/`.
   - En `public/sw.js`, excluye explícitamente todas las rutas `/api/*` del caché para garantizar respuestas frescas en vivo.

---

## 2. ESTÁNDARES MUNDIALES (ISO) Y ARQUITECTURA FINANCIERA (3-WAY MATCH)
Actualiza `src/lib/schemas.ts` y `src/lib/engine.ts` para reflejar estándares bancarios y de auditoría internacionales sin romper ningún test existente:

1. **Estándares ISO Embebidos:**
   - **ISO 20022 (`iso20022_status`):** Mapea cada decisión a su código bancario internacional equivalente:
     - `PAGAR` -> `'ACCP'` (*AcceptedCustomerProfile / Settlement Approved*)
     - `ESCALAR` -> `'PDNG'` (*Pending Human Authorization*)
     - `FRENAR` -> `'RJCT'` (*Rejected by Policy Guard*)
   - **ISO 4217 & ISO 8601:** Normalización obligatoria de divisas (`USD`, `COP`, `MXN`, `ARS`, `BRL`, `EUR`) a `monto_usd` con `tasa_cambio` congelada en el instante de evaluación (tanto si extrae DeepSeek como si extrae el motor determinista). Si `findDate` no halla fecha en el documento, registra una advertencia explícita en `traza_evaluacion`.
   - **ISO/IEC 27001 & SOC 2 (`hash_auditoria`):** El hash SHA-256 debe ser **100% determinista** sobre el contenido financiero (`invoice_id + emisor + monto_usd + estado + regla_disparada`), sin depender del reloj, permitiendo verificar integridad.

2. **Triple Cruce Contable con ERPs (3-Way Match Object):**
   Añade a `AgentDecisionSchema` el objeto opcional `three_way_match`:
   - `vendor_match`: boolean (¿Existe en el Maestro de Proveedores del ERP y pasó el filtro anti-spoofing?).
   - `agreement_match`: boolean (¿Cumple con el SLA / monto máximo acordado en `acuerdos_por_proveedor`?).
   - `budget_liquidity_match`: boolean (¿Es cobro único y existe saldo disponible en el presupuesto mensual?).

---

## 3. EL AGENTE CONTEXTUAL: CÓMO LAS REGLAS AJUSTAN A LA IA (ISO/IEC 42001)
Para demostrar que Jippay posee un verdadero agente neuro-simbólico gobernado por reglas (`src/lib/extractor.ts`):

1. **Inyección Dinámica de Reglas al Prompt (`buildAgentSystemPrompt(rules)`):**
   - Crea y exporta una función `buildAgentSystemPrompt(rules: CompanyRules): string` que construya el System Prompt inyectando en vivo:
     - La lista actual de `proveedores_permitidos` del ERP.
     - Los `acuerdos_por_proveedor` vigentes.
     - El `limite_monto_automatico` y `presupuesto_mensual_restante`.
   - Modifica `extractInvoiceFromText(rawText: string, rules?: CompanyRules)` para que use este prompt dinámico al llamar a DeepSeek (`deepseek-chat`) y también enriquezca el análisis determinista.
2. **Telemetría del Agente en `InvoiceSchema`:**
   - Añade a `InvoiceSchema`:
     - `extraction_engine`: `'deepseek-llm' | 'deterministic-fallback'`
     - `agent_reasoning`: `string` (Explicación semántica del agente: qué documento leyó, cómo identificó al proveedor contra el catálogo ERP, qué moneda detectó y si observó anomalías contractuales).
     - `confidence_score`: `number` (0 a 100).
     - `system_prompt_preview`: `string` (Resumen del contexto de reglas inyectado en esa ejecución).

---

## 4. SEGREGACIÓN DE FUNCIONES (SOX RBAC) Y BACKEND DE AUTH (SUPABASE-READY)
En cumplimiento con **Sarbanes-Oxley (SOX)**, quien configura reglas no es el mismo rol que audita o aprueba excepciones. Construye la capa de identidad en `src/lib/auth/session.ts`:

1. **Roles de Seguridad Mundial (`UserRole`):**
   - `'CFO_ADMIN'`: Puede editar reglas en `/admin`, sincronizar ERPs y aprobar escalamientos.
   - `'CONTROLLER_APPROVER'`: No puede alterar presupuestos maestros ni whitelist en `/admin`, pero es el responsable *Human-in-the-Loop* de aprobar o rechazar facturas en estado `ESCALAR` en `/terminal`.
   - `'AUDITOR_VIEWER'`: Acceso estrictamente de solo lectura (*Read-Only*) a `/admin` y `/terminal`; puede inspeccionar trazas y descargar conciliaciones CSV/JSON, pero tiene bloqueados los botones de mutación.

2. **Endpoints de Autenticación y Ventas (Preparados para Supabase):**
   - Implementa adaptador que lea `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` si existen, y opere con sesiones firmadas en cookies `HttpOnly` (`jippay_session`) + usuarios corporativos preconfigurados (`cfo@jippay.us`, `controller@jippay.us`, `auditor@jippay.us`) como fallback inmediato.
   - Crea las rutas:
     - `POST /api/auth/login` (soporta login por credenciales o cambio rápido de rol Demo SOX).
     - `POST /api/auth/register` (registro de empresa matriz EE. UU. con operaciones LATAM).
     - `POST /api/auth/logout` y `GET /api/auth/me`.
     - `POST /api/sales-lead` (valida con Zod y registra prospectos comerciales desde `/sales`).
   - En `AgentDecisionSchema`, añade `approved_by?: string` y `approval_note?: string` para dejar constancia forense de qué usuario y rol firmó una factura escalada.