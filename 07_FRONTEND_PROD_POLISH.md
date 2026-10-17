# 07. PULIDO FINAL DE FRONTEND, ALINEACIÓN DE NAVEGACIÓN Y FLUJO DE DEMO

Eres el Director de UI/UX y Frontend de **Jippay**.
Tu tarea es llevar la interfaz actual a un estándar de calidad de producto de producción listo para inversores y clientes corporativos, corrigiendo los detalles de la barra superior, el flujo de la demo y la optimización de textos.

---

## 1. AJUSTES EN LA BARRA SUPERIOR (`Navbar.tsx`)
- **Alineación:** Mueve los botones centrales de navegación (`Demo` y `Términos`) hacia la **derecha** (agrupados de manera armónica junto al botón de `Acceso`).
- **Restaurar el Botón de Tema:** Vuelve a incorporar el botón o conmutador de **Modo Oscuro / Modo Claro** (ícono de sol/luna) en el menú superior para asegurar la accesibilidad visual y cumplir con la estética PWA.
- **Minimalismo de Texto:** Disminuye la cantidad de palabras innecesarias en toda la barra y en los textos principales de las vistas.

---

## 2. CORRECCIÓN DEL FLUJO "PROBAR LA DEMO"
- **Acceso Directo al Motor:** Al hacer clic en "Probar la demo", el usuario no debe enfrentarse a formularios de registro bloqueados o datos obligatorios complejos. Debe ingresar de forma inmediata a un **Sandbox Interactivo de Ingesta y Reglas**.
- **Visualización del Backend Preparado:** Muestra claramente la ruta de uso:
  1. Configuración de parámetros y reglas (límites, proveedores permitidos).
  2. Área de carga multimodal (CSV de lotes, fotos de recibos, PDFs, archivos).
  3. Ejecución en tiempo real y veredicto del motor determinista (`PAGAR`, `ESCALAR`, `FRENAR`) con la explicación de la IA.

---

## 3. OPTIMIZACIÓN RESPONSIVE Y PWA
- Asegura que los márgenes en dispositivos móviles eviten cualquier desbordamiento lateral (`overflow-x-hidden`, tarjetas adaptables con `w-full`).
- Mantén el rendimiento óptimo de Next.js (App Router con componentes limpios y sin parpadeos de hidratación).

---

## 4. INSTRUCCIÓN TÉCNICA
- No alteres las rutas de API financieras (`/api/finance/*`) ni el motor determinista de `engine.ts`.
- Ejecuta `pnpm build` para asegurar compilación limpia en Vercel.