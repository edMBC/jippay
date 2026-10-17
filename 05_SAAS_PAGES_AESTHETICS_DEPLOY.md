# 05. ECOSISTEMA COMERCIAL SAAS, ESTÉTICA iOS DARK (KISS UI) & PREPARACIÓN DE DEPLOY

Eres el Director de Producto, UI/UX (Apple Human Interface Guidelines) y DevOps de **Jippay**.
Tu objetivo es transformar la interfaz en un producto SaaS B2B de clase mundial manteniendo una estética monocromática impecable (negros, grafito, titanio y blanco) y dejarlo listo para control de versiones (`git`) y despliegue en **Vercel**.

---

## 1. REFINAMIENTO ESTÉTICO iOS DARK & TEMA DE ALTO CONTRASTE
1. **Selector de Modo Visual en `Navbar.tsx`:**
   - Permite alternar entre **`Obsidian Dark`** (fondo `#09090b`, tarjetas translúcidas `bg-zinc-900/65`) y **`Titanium Daylight / High-Contrast`** (superficies grafito claro/plata con máximo contraste tipográfico para proyectores o salones iluminados durante el pitch).
2. **Selector Rápido de Rol SOX en `Navbar.tsx`:**
   - Muestra el usuario/rol activo (`CFO Admin`, `Controller Approver`, `External Auditor`) con un desplegable o píldora de 1 clic para cambiar de rol en vivo durante la demostración, además del enlace a `/login`.
3. **Navegación Completa (Desktop + Mobile iOS Tab Bar):**
   - Rutas visibles: `Demo Pitch (/)`, `Enterprise & ROI (/sales)`, `Terminal (/terminal)`, `Gobierno & ERP (/admin)`, `Acceso (/login)`.

---

## 2. NUEVAS PÁGINAS DE PRODUCTO EN PRODUCCIÓN (`src/app/`)

### A. Portal de Login (`/login`) y Registro (`/register`)
- **`src/app/login/page.tsx`:**
  - Tarjeta central `IOSGlassCard` con login corporativo (Email + Password) conectado a `POST /api/auth/login`.
  - **Bloque Destacado "1-Click SOX Role Sandbox":** 3 tarjetas interactivas para entrar instantáneamente como:
    1. **CFO / Policy Admin** (`cfo@jippay.us`) -> Control total de reglas y ERP.
    2. **Finance Controller** (`controller@jippay.us`) -> Aprobación Human-in-the-Loop.
    3. **ISO/SOX External Auditor** (`auditor@jippay.us`) -> Auditoría forense en modo solo lectura.
- **`src/app/register/page.tsx`:**
  - Registro para empresas de EE. UU. con equipos en LATAM (Nombre de empresa, Email corporativo, Presupuesto mensual inicial en USD, Rol inicial) que inicializa las reglas y redirige a `/terminal`.

### B. Enterprise Sales, Compliance & ROI Page (`src/app/sales/page.tsx`)
Diseñada para convencer a directores financieros y jurados de negocio:
1. **Calculadora Interactiva de ROI en Tiempo Real:**
   - Sliders estilo iOS para *Facturas mensuales (20 a 2,000)*, *Minutos manuales por factura* y *Costo hora del equipo en USD*.
   - Muestra en vivo: **Horas ahorradas/año**, **Ahorro financiero en USD** y **Reducción del 100% en pagos fuera de política**.
2. **Matriz de Estándares y Arquitectura Financiera:**
   - Tarjetas visuales explicando: **3-Way Match ERP (Odoo, SAP, QuickBooks, NetSuite)**, **Cumplimiento ISO 20022 & ISO 4217 FX**, **Gobernanza IA ISO/IEC 42001** y **Segregación de Funciones SOX**.
3. **Planes SaaS (`Seed`, `Growth LATAM`, `Enterprise Custom`)** + **Formulario de Agendar Demo** conectado a `POST /api/sales-lead`.

### C. Evolución de `/`, `/admin` y `/terminal` (Impacto Backend + Frontend)
1. **En `/` (Landing & Live Demo):**
   - Mantén el simulador determinista instantáneo en el Hero y añade una sección visual que explique el flujo **"Cómo las Reglas Moldean el Contexto del Agente"** antes de pasar al motor matemático.
2. **En `/admin` (Gobierno, ERP y Multi-DB):**
   - Conecta los anillos `IOSMetricRing` a métricas **100% reales y reactivas** del `store` (presupuesto real consumido, % de autonomía real, facturas frenadas). Elimina cualquier número hardcodeado.
   - Corrige el botón de **Exportar / Importar Snapshot** para que descargue y restaure un paquete JSON completo `{ rules, decisions, processedIds }`.
   - Si el rol activo es `'AUDITOR_VIEWER'` o `'CONTROLLER_APPROVER'`, muestra un banner de protección SOX y deshabilita la edición de reglas maestras.
3. **En `/terminal` (Consola Multimodal y Explicabilidad Agéntica):**
   - En cada factura procesada, muestra el sello visual de **3-Way Match** (`[✓ Proveedor ERP]`, `[✓ Acuerdo SLA]`, `[✓ Liquidez & FX]`) y su código **ISO 20022** (`ACCP`, `PDNG`, `RJCT`).
   - En el Inspector Forense (`IOSSlideDrawer` / Panel lateral), añade la vista **"Cerebro del Agente & Contexto Inyectado"** donde se vea:
     - Qué motor ejecutó la lectura (`DeepSeek LLM` vs `Deterministic Fallback`) y su `% de Confianza`.
     - El `agent_reasoning` (razonamiento semántico del agente).
     - El prompt de contexto dinámico generado con las reglas actuales de `/admin`.
   - En los casos `ESCALAR`, al aprobar o rechazar con nota, guarda el nombre y rol del usuario activo (`approved_by`). Si el rol es `AUDITOR_VIEWER`, deshabilita el botón de aprobar mostrando el candado SOX.

---

## 3. PREPARACIÓN DE DEPLOY EN VERCEL Y CONTROL DE VERSIONES
1. En `package.json`, asegúrate de tener `"test": "vitest run"` y `"qa": "tsx scripts/run-qa-smoke.ts"`.
2. Crea `.env.example` documentando `DEEPSEEK_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
3. Verifica que `.gitignore` excluya `node_modules/`, `.next/`, `.env*.local` y `.data/`.
4. Ejecuta y pasa al 100%:
   - `pnpm test` (incluyendo nuevos tests para Auth RBAC, 3-Way Match, ISO 20022 y Context Prompt del Agente).
   - `npx tsc --noEmit` (0 errores).
   - `pnpm lint` (0 errores).
   - `pnpm build` (generando físicamente `.next/` con todas las rutas `/`, `/sales`, `/login`, `/register`, `/admin`, `/terminal` y endpoints API).