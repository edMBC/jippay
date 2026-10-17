import path from "node:path";
import { defineConfig } from "vitest/config";

// Resolución del alias `@/*` -> `src/*` para que los tests de integración
// puedan importar los route handlers del App Router con la misma sintaxis
// que usa el código de producción.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
  },
});
