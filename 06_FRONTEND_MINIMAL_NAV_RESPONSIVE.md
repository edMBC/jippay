# 06. SIMPLIFICACIÓN DE NAVEGACIÓN (3 VENTANAS), LIMPIEZA DE UI Y RESPONSIVE PWA

Eres el Director de UI/UX y Frontend de **Jippay**.
Tu objetivo es eliminar el desorden visual actual de la barra superior y adaptar la aplicación a una experiencia SaaS B2B limpia, elegante y 100% responsiva (móvil y escritorio), manteniendo intacta la lógica de negocio y el backend operativo.

---

## 1. REDISEÑO TOTAL DE LA BARRA SUPERIOR (`Navbar.tsx`)
Elimina todos los widgets técnicos visibles en la captura (presupuestos estáticos, indicadores de DB, selectores de roles masivos y badges de motor de IA en el header principal).

La barra superior (`Navbar`) debe mantener exclusivamente un diseño minimalista de **3 elementos / ventanas**:
1. **Logo / Marca:** `Jippay.` (llevando a la raíz `/`).
2. **Navegación Central / Enlaces Limpios:**
   - **Demo / Inicio** (`/` o sección interactiva).
   - **Términos y Condiciones** (página o modal limpio `/terms`).
3. **Botón de Acción Derecha:**
   - **Acceso / Terminal** (`/login` o `/terminal` dependiendo de si el usuario tiene sesión activa, o un botón directo de "Acceso" que lleva a `/login`).

*(Nota: Los selectores avanzados de roles SOX, ajustes de presupuesto y estado de DB no deben saturar el header principal; deben reubicarse de forma discreta dentro del panel `/admin` o el menú de perfil).*

---

## 2. REFINAMIENTO DE LAS VISTAS PRINCIPALES
1. **Landing & Demo (`/`):**
   - Un Hero limpio y directo que explique Jippay en menos de 5 segundos (*"La IA lee. El código decide. Tú descansas"*).
   - Un bloque de **Demo Interactiva Simplificada** donde el usuario pueda ver la ruta de uso fácilmente (arrastrar o probar una factura de prueba y ver el veredicto en tiempo real) sin fricción.
2. **Página de Acceso (`/login`):**
   - Centrada, con la misma tipografía y colores oscuros refinados (`#09090b`), eliminando distracciones y permitiendo el acceso por credenciales o el sandbox de prueba de forma elegante.
3. **Página de Términos y Condiciones (`/terms`):**
   - Una vista tipográfica limpia, estructurada bajo estándares legales B2B (explicando que Jippay es un validador y emisor de decisiones contables que no opera como pasarela de pago directa).

---

## 3. BLINDAJE RESPONSIVE PARA PWA (CERO DESBORDES EN MÓVIL)
- **Contenedores y Grids:** Asegura que todas las páginas usen `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` y que ninguna tarjeta o tabla fuerce un ancho fijo que desborde la pantalla del teléfono (`overflow-x-auto` en tablas y `w-full` en inputs/tarjetas).
- **Tipografía adaptable:** Tamaños de títulos escalados correctamente con clases de Tailwind (`text-3xl sm:text-5xl`) para evitar saltos extraños en dispositivos móviles.
- **Barra Inferior Móvil (Bottom Tab Bar):** Si se visualiza en PWA móvil, mantén una barra inferior discreta con los accesos directos principales para navegación táctil sin romper el diseño.

---

## 4. INSTRUCCIÓN TÉCNICA DE EJECUCIÓN
- No alteres ni rompas la lógica de backend, el motor determinista (`engine.ts`), ni las rutas de API de Supabase o reservas financieras.
- Ejecuta `pnpm test`, `npx tsc --noEmit`, `pnpm lint` y `pnpm build` para verificar que la compilación sea limpia (exit 0) antes del siguiente commit.