import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { DEMO_USERS } from "../src/lib/auth/session";
import { PostgresTransactionalLedger } from "../src/lib/finance/postgres-ledger";
import { defaultCompanyRules } from "../src/lib/mock-data";

/**
 * Aplica las migraciones financieras (`src/lib/finance/migrations/*.sql`) contra
 * la base PostgreSQL conectada vía `DATABASE_URL` y verifica el esquema resultante.
 *
 * Uso:
 *   pnpm db:migrate          # aplica migraciones + verifica el esquema
 *   pnpm db:seed             # aplica migraciones + verifica + siembra la empresa demo
 *
 * Requisitos de `DATABASE_URL`:
 *   Debe ser la conexión DIRECTA de PostgreSQL de Supabase (puerto 5432), no el
 *   pooler de transacciones (Supavisor, puerto 6543). El ledger usa funciones
 *   SECURITY DEFINER, bloqueos de fila y transacciones multi-sentencia que exigen
 *   una sesión estable con el rol privilegiado (`postgres`, con BYPASSRLS).
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "finance", "migrations");

async function applyMigrations(pool: Pool): Promise<string[]> {
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`Aplicando ${file}... `);
    await pool.query(sql);
    applied.push(file);
    process.stdout.write("ok\n");
  }
  return applied;
}

async function seedDemoCompany(ledger: PostgresTransactionalLedger): Promise<void> {
  const companyId = "jippay-us";
  if (await ledger.getCompany(companyId)) {
    console.log(`Empresa demo ya existe (${companyId}); siembra omitida.`);
    return;
  }

  const period = new Date().toISOString().slice(0, 7);
  await ledger.seedCompany(companyId, "Jippay US", defaultCompanyRules, period);

  for (const user of Object.values(DEMO_USERS)) {
    if (user.company_id === companyId) {
      await ledger.seedMembership(companyId, user.email, user.role);
    }
  }

  console.log(`Empresa demo sembrada: ${companyId} (${period}).`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL no configurado.");
    console.error(
      "Define la cadena de conexión DIRECTA de PostgreSQL de Supabase (puerto 5432), no el pooler de transacciones (6543).",
    );
    process.exit(1);
  }

  const seed = process.argv.includes("--seed");

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const applied = await applyMigrations(pool);
    console.log(`Migraciones aplicadas (${applied.length}): ${applied.join(", ")}`);

    const ledger = new PostgresTransactionalLedger();
    const verification = await ledger.verify();
    if (!verification.ok) {
      console.error("La verificación del esquema falló:", verification.reason);
      process.exit(1);
    }
    console.log("Esquema financiero verificado:", verification.reason);

    if (seed) {
      await seedDemoCompany(ledger);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
