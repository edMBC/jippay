# ESPECIFICACIÓN DE CONSTRUCCIÓN Y AUDITORÍA AUTÓNOMA: JIPPAY v2.0

Actúas como un Agente Ingeniero Full Stack autónomo. Tu fuente de verdad arquitectónica y visual es el archivo `Jippay.html` ubicado en la raíz[cite: 4].
NO pidas confirmación humana en ningún paso. Ejecuta comandos, crea archivos, corre tests, valida el build y corrige errores en bucle hasta cumplir el 100% de los criterios.

## 1. ARQUITECTURA EXACTA DE ARCHIVOS A CONSTRUIR (SEGÚN JIPPAY.HTML)

### A. Contratos y Validación (`src/lib/schemas.ts`)[cite: 4]
Implementa con `zod` exactamente los esquemas del documento HTML (expandidos para cubrir todos los casos trampa del reto)[cite: 4]:
- `InvoiceSchema`:[cite: 4]
  - `id`: string[cite: 4]
  - `emisor`: string[cite: 4]
  - `monto`: number (positive)[cite: 4]
  - `moneda`: string (default "USD")[cite: 4]
  - `fecha_vencimiento`: string (YYYY-MM-DD)[cite: 4]
  - `concepto`: string[cite: 4]
  - `monto_acordado`: number().optional() (para validar si la factura cuadra con lo acordado previamente)
- `CompanyRulesSchema`:[cite: 4]
  - `limite_monto_automatico`: number (nonnegative)[cite: 4]
  - `presupuesto_mensual_restante`: number (nonnegative)[cite: 4]
  - `proveedores_permitidos`: array de strings[cite: 4]
  - `acuerdos_por_proveedor`: z.record(z.string(), z.number()).optional() (mapa proveedor -> monto máximo acordado)
- `AgentDecisionSchema`:[cite: 4]
  - `invoice_id`: string[cite: 4]
  - `factura`: InvoiceSchema.optional()
  - `estado`: z.enum(['PAGAR', 'ESCALAR', 'FRENAR'])[cite: 4]
  - `regla_disparada`: string (ej. 'REGLA_0_DUPLICADA', 'REGLA_1_PROVEEDOR', 'REGLA_2_PRESUPUESTO', 'REGLA_ACUERDO_PREVIO', 'REGLA_3_LIMITE_AUTO', 'APROBACION_AUTOMATICA')
  - `razon`: string (explicación clara y auditable en español para finanzas)[cite: 4]
  - `traza_evaluacion`: z.array(z.string()) (lista paso a paso de cada validación ejecutada)
  - `timestamp`: string[cite: 4]

### B. Motor Determinista Cero Alucinaciones (`src/lib/engine.ts`)[cite: 4]
Función pura `evaluateInvoice(invoice: Invoice, rules: CompanyRules, processedIds: string[]): AgentDecision`[cite: 4].
Evalúa en orden estricto e inflexible[cite: 4]:
1. **Regla 0 (Factura Duplicada):** Si `invoice.id` está en `processedIds` (case-insensitive, trim) -> retorna `FRENAR`[cite: 4].
2. **Regla 1 (Proveedor Autorizado):** Si `invoice.emisor` no está en `rules.proveedores_permitidos` (case-insensitive, trim) -> retorna `FRENAR`[cite: 4].
3. **Regla 2 (Presupuesto Disponible):** Si `invoice.monto > rules.presupuesto_mensual_restante` -> retorna `FRENAR`[cite: 4].
4. **Regla 2.5 (Desviación de lo Acordado):** Si existe un monto acordado (en `invoice.monto_acordado` o en `rules.acuerdos_por_proveedor[emisor]`) y `invoice.monto > monto_acordado` -> retorna `ESCALAR` (u opción configurable) explicando la discrepancia contra el contrato/acuerdo.
5. **Regla 3 (Límite Automático):** Si `invoice.monto > rules.limite_monto_automatico` -> retorna `ESCALAR` indicando que requiere aprobación humana[cite: 4].
6. **Cumplimiento Total:** Si pasa todo -> retorna `PAGAR`, detallando cuánto presupuesto quedará disponible (`presupuesto_mensual_restante - monto`).

### C. Catálogo de Casos de Prueba y Casos Trampa (`src/lib/mock-data.ts`)[cite: 4]
- Exporta `defaultCompanyRules`: límite automático `1000`, presupuesto mensual `5000`, proveedores permitidos `['DevCorp', 'LatamDesign', 'CloudHost', 'AndesConsulting']`, acuerdos `{'DevCorp': 800, 'LatamDesign': 2000}`[cite: 4].
- Exporta `sampleRawInvoices`: Mínimo **12 facturas realistas en texto crudo** (simulando correos, PDFs en texto y mensajes de Slack/WhatsApp de proveedores en LATAM y EE. UU.) que cubran:
  1. Factura normal aprobable ($450 USD de DevCorp - `INV-204`)[cite: 4].
  2. Proveedor desconocido no autorizado ($300 USD de HackerLabs - `INV-999`)[cite: 4].
  3. Monto que supera límite automático y requiere humano ($1,850 USD de LatamDesign - `INV-301`)[cite: 4].
  4. Monto que excede el presupuesto mensual restante ($6,200 USD de CloudHost - `INV-405`)[cite: 4].
  5. Cobro duplicado (mismo ID `INV-204` de DevCorp)[cite: 4].
  6. Factura que no cuadra con lo acordado (DevCorp cobrando $950 USD cuando su acuerdo es $800 USD - `INV-208`).
  7. Casos adicionales con ruido en el texto, diferentes monedas (COP, MXN convertidas o marcadas) y fechas borde.

### D. Extractor Neuro-Simbólico + Fallback Resiliente (`src/lib/extractor.ts` y `src/app/api/process-invoice/route.ts`)[cite: 4]
- En `src/lib/extractor.ts`, crea `extractInvoiceFromText(rawText: string): Promise<Invoice>`.
- Si `process.env.DEEPSEEK_API_KEY` existe, usa `@ai-sdk/openai` (configurado con `baseURL: 'https://api.deepseek.com/v1'`) y `generateObject` de `ai` con `InvoiceSchema`[cite: 4].
- **CRÍTICO PARA DEMOS Y TESTS:** Si no hay API key o la red falla, ejecuta automáticamente un parser determinista inteligente (Regex + heurísticas) capaz de extraer `id`, `emisor`, `monto`, `moneda`, `fecha_vencimiento`, `concepto` y `monto_acordado` de cualquiera de los textos de `sampleRawInvoices` y de cualquier texto libre estructurado.
- En `src/app/api/process-invoice/route.ts`, expón el endpoint `POST` que recibe `{ rawText, rules, processedIds }`, extrae el JSON con `extractInvoiceFromText`, lo valida con `InvoiceSchema`, ejecuta `evaluateInvoice` y retorna `{ invoice, decision }`[cite: 4].

### E. Estado Global Sincronizado (`src/lib/store.tsx`)
- Crea un React Context persistido en `localStorage` (`jippay_rules_v2`, `jippay_decisions_v2`, `jippay_processed_ids_v2`) para que los cambios hechos en `/admin` afecten en tiempo real a `/terminal`[cite: 4], y permita:
  - Modificar reglas y restaurar valores de fábrica.
  - Procesar una factura individual o correr "Auditar Todo el Lote" (Stress Test).
  - Descontar automáticamente del `presupuesto_mensual_restante` cuando una factura queda en estado `PAGAR`.
  - Permitir que un humano haga clic en "Aprobar Pago" o "Rechazar" en las facturas que quedaron en estado `ESCALAR`.

### F. Las 3 Vistas con Diseño Institucional Oscuro (`zinc-950`, `zinc-900`, `zinc-800`)[cite: 4]
Usa exactamente la misma estética de `Jippay.html` (fuente Inter + JetBrains Mono, fondo `#09090b`, tarjetas `bg-zinc-900 border-zinc-800`, cero colores estridentes)[cite: 4]:
1. **Navbar Superior Compartido (`src/components/Navbar.tsx`):** Logo `Jippay.`, badge `v2.0 FullStack`, indicadores en vivo del Presupuesto Restante y Límite Automático, y navegación entre `/` (Pitch), `/admin` (Reglas) y `/terminal` (Terminal en Vivo)[cite: 4].
2. **Vista 1 - Landing Page (`src/app/page.tsx`):** Hero section *"Automatiza tus cuentas por pagar sin perder el control"*, diagrama interactivo comparando "Dominio Probabilístico (IA Lectora)" vs "Dominio Determinista (Auditor en Código)", métricas de Éxito (Autonomía, Seguridad Cero Fallos, Explicabilidad) y CTAs hacia `/admin` y `/terminal`[cite: 4].
3. **Vista 2 - Admin Panel (`src/app/admin/page.tsx`):** Controles numéricos y sliders para Límite Automático y Presupuesto Mensual, gestor interactivo de Lista Blanca de Proveedores (añadir/eliminar badges), tabla de Acuerdos Comerciales por proveedor y botón de "Resetear Demo"[cite: 4].
4. **Vista 3 - Terminal de Operaciones (`src/app/terminal/page.tsx`):**[cite: 4]
   - **Bloque A (Ingesta + Casos Trampa):** Botones rápidos para cargar cada uno de los casos de `sampleRawInvoices`, botón "Ejecutar Stress Test (Lote Completo)" y `textarea` para pegar facturas manuales[cite: 4].
   - **Bloque B (Inspector JSON IA):** Visor monoespaciado mostrando el objeto exacto extraído y validado por Zod[cite: 4].
   - **Bloque C (Log de Auditoría Explicable):** Tabla histórica filtrable (`TODOS`, `PAGAR`, `ESCALAR`, `FRENAR`) mostrando la razón en lenguaje natural, desplegable con la traza de reglas paso a paso, y botones de aprobación humana para los casos `ESCALAR`[cite: 4].

## 2. PROTOCOLO DE VALIDACIÓN AUTOMÁTICA (OBLIGATORIO ANTES DE TERMINAR)

1. **Suite de Pruebas Unitarias y de Estrés (`src/lib/__tests__/jippay.test.ts`):**
   - Escribe al menos **25 tests en Vitest** probando `InvoiceSchema`, `evaluateInvoice` y `extractInvoiceFromText`.
   - Verifica explícitamente: Seguridad (0 pagos aprobados fuera de reglas), detección de duplicados, proveedores fuera de whitelist (incluyendo variaciones de mayúsculas/espacios), exceso de presupuesto, exceso de acuerdo previo, exceso de límite automático y descuento correcto de saldo.
   - Ejecuta `pnpm vitest run` y corrige el código hasta que el 100% de los tests pasen en verde.
2. **Validación de Tipado y Build de Producción para Vercel:**
   - Ejecuta `npx tsc --noEmit` y `pnpm build`.
   - Si hay cualquier error de TypeScript, ESLint o compilación de Next.js, corrígelo y repite `pnpm build` hasta obtener salida limpia (exit code 0).
3. **Reporte Matutino (`MORNING_AUDIT.md`):**
   - Escribe un archivo `MORNING_AUDIT.md` en la raíz con el resumen de archivos creados, el output de `pnpm vitest run`, el resultado de `pnpm build` y una guía de 3 pasos para probar la interfaz al despertar.