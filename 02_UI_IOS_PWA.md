# 02. ESPECIFICACIÓN ESTÉTICA iOS 18 DARK MONOCHROME, 3 VISTAS & ARQUITECTURA PWA

Eres el Diseñador Principal de Interfaces (Apple Human Interface Guidelines) y Arquitecto Frontend de **Jippay**.
Toda la interfaz debe respetar estrictamente la paleta monocromática de `Jippay.html`: **negro profundo, grafito, titanio, plata y blanco** (`#000000`, `#09090b`, `#121215`, `#18181b`, `#27272a`, `#a1a1aa`, `#f4f4f5`). Prohibido usar colores chillones o saturados.

---

## 1. SISTEMA DE COMPONENTES iOS DARK MODE (`src/components/ui/`)
Construye componentes modulares con acabado Apple Dark Mode:
1. `IOSGlassCard.tsx`: `bg-zinc-900/65 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`.
2. `IOSSegmentedControl.tsx`: Selector tipo píldora deslizante suave para alternar pestañas internas sin recargar página.
3. `IOSBottomSheet.tsx` / `IOSSlideDrawer.tsx`: Panel emergente con desenfoque de fondo para ver el detalle forense de cualquier factura (documento original, JSON extraído, hash SHA-256 y los 6 pasos de la traza determinista).
4. `IOSMetricRing.tsx`: Anillos SVG minimalistas en tonos blanco/plata/grafito para mostrar % de Presupuesto Consumido, % de Autonomía del Agente y Facturas Bloqueadas.
5. `IOSStatusBadge.tsx`:
   - `PAGAR`: Píldora blanca sólida con texto negro (`bg-zinc-100 text-zinc-950 font-semibold`) + icono Check.
   - `ESCALAR`: Píldora gris titanio con borde claro (`bg-zinc-800/90 text-zinc-200 border border-zinc-500`) + icono Reloj/Humano.
   - `FRENAR`: Píldora grafito oscuro con borde de alto contraste (`bg-zinc-950 text-zinc-400 border border-zinc-700 line-through decoration-zinc-600`) + icono Escudo/Bloqueo.

---

## 2. DISEÑO DE LAS 3 PANTALLAS PRINCIPALES (`src/app/`)

### VISTA 1: Landing Pitch (`src/app/page.tsx`)
- Hero estilo Apple Keynote: *"Jippay. Lee con IA. Decide con Código."*
- **Simulador Interactivo Instantáneo:** Un control deslizante en la misma portada donde el juez mueve el monto de una factura ($200 -> $1,400 -> $7,000) o cambia el proveedor y observa cómo el árbol determinista cambia su decisión en 0 milisegundos con explicación auditable.
- **Bento Grid Arquitectónico:** Tarjetas explicando Neuro-Symbolic AI, Conector ERP/Multi-DB, Seguridad Anti-Spoofing y Conciliación Automática.

### VISTA 2: Centro de Control de Reglas, ERP & Multi-DB (`src/app/admin/page.tsx`)
Organizado en 3 pestañas limpias usando `IOSSegmentedControl`:
1. **Reglas Financieras:** Sliders e inputs tipo iOS para Límite de Aprobación Automática, Presupuesto Mensual Restante (con `IOSMetricRing`), y Perfiles Rápidos ("Modo Estricto Startup", "Modo Balanceado Scaleup", "Modo Corporativo").
2. **Proveedores & Conexión ERP / CSV:**
   - Gestor de Lista Blanca de Proveedores y Acuerdos Comerciales máximos por proveedor.
   - **Panel de Sincronización ERP / CSV en vivo:** Botones para importar un archivo `.CSV` de proveedores/contratos, o sincronizar plantillas simuladas de **Odoo ERP / SAP / QuickBooks** con un clic, mostrando notificación de cuántos proveedores y acuerdos fueron actualizados.
3. **Infraestructura Multi-DB:** Panel de estado con latencia en vivo (`ms`) de `Local File-DB`, `PostgreSQL/Supabase` y `Edge Memory`, botón "Probar Conexiones DB" y botón para descargar/restaurar Snapshot JSON.

### VISTA 3: Terminal Multimodal de Auditoría (`src/app/terminal/page.tsx`)
- **Selector de Canal de Entrada (`IOSSegmentedControl`):**
  1. `Subir Archivo (PDF / Foto / CSV)`: Drag & Drop real + botón móvil **"Usar Cámara para Foto de Recibo"** (`capture="environment"`).
  2. `Galería de Pruebas (12 Casos + Archivos Reales)`: Botones clasificados en *Casos Normales*, *Casos Trampa Financieros* y *Ataques de Seguridad (Spoofing / Prompt Injection)*.
  3. `Correo / Chat en Vivo`: Área de texto para pegar mensajes de WhatsApp, Slack o correos.
- **Botón Maestro "Ejecutar Stress Test (Lote Completo)"** + Botón **"Exportar Conciliación a ERP (.CSV / .JSON)"**.
- **Vista Dividida / Adaptativa:**
  - Previsualizador visual del documento (muestra el recibo/PDF/correo y su Hash SHA-256) + Inspector JSON validado por Zod.
  - **Registro Inmutable de Decisiones:** Filtrable por `TODOS`, `PAGAR`, `ESCALAR`, `FRENAR`. Cada fila muestra la explicación clara en español humano y abre el `IOSSlideDrawer` con la traza completa. Los casos `ESCALAR` permiten aprobar o rechazar manualmente con nota de auditoría.

---

## 3. RESPONSIVE MÓVIL-FIRST & PWA INSTALABLE
1. **PWA Nativa:**
   - Implementa `src/app/manifest.ts` (o `public/manifest.webmanifest`), iconos monocromáticos en `public/icons/`, meta tags `apple-mobile-web-app-capable` en `layout.tsx` y Service Worker (`public/sw.js`).
2. **Navegación Dual (Desktop vs Mobile):**
   - **Desktop (`>= 768px`):** Barra superior translúcida con métricas de presupuesto en vivo, estado de DB y links a las 3 vistas.
   - **Móvil (`< 768px`):** Barra inferior fija estilo iOS (`iOS Bottom Tab Bar` con `backdrop-blur-2xl` y `safe-area-inset-bottom`) con iconos grandes para `Pitch (/)`, `Terminal (/terminal)` y `Reglas & ERP (/admin)`.
   - Cero desbordamiento horizontal (`overflow-x-hidden`): en móvil las tablas de auditoría se renderizan automáticamente como **iOS Stacked Cards** táctiles.