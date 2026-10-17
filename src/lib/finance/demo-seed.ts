import { DEMO_USERS } from "../auth/session";
import { defaultCompanyRules } from "../mock-data";
import type { TransactionalLedger } from "./ledger";

export const DEMO_COMPANY_ID = "jippay-us";

/**
 * Decide si la siembra de la empresa demo está permitida.
 *
 * - `ALLOW_DEMO_SEED=false` la desactiva siempre (incluso en desarrollo).
 * - En producción está desactivada por defecto; solo se habilita con el opt-in
 *   explícito `ALLOW_DEMO_SEED=true` (una decisión consciente del operador).
 * - En desarrollo/tests se permite por defecto para no romper el flujo local.
 */
export function isDemoSeedAllowed(): boolean {
  if (process.env.ALLOW_DEMO_SEED === "false") return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.ALLOW_DEMO_SEED === "true";
  }
  return true;
}

/**
 * Siembra explícita y acotada para desarrollo/demo. NO se ejecuta de forma
 * automática durante el build o el inicio: se invoca de forma perezosa solo
 * cuando una operación de demo lo requiere y `isDemoSeedAllowed()` lo permite.
 * Es idempotente: nunca sobrescribe una empresa ni membresías ya existentes.
 */
export async function ensureDemoCompany(ledger: TransactionalLedger): Promise<void> {
  if (!isDemoSeedAllowed()) return;

  const companyId = DEMO_COMPANY_ID;
  if (await ledger.getCompany(companyId)) return;

  const period = new Date().toISOString().slice(0, 7);
  await ledger.seedCompany(companyId, "Jippay US", defaultCompanyRules, period);

  for (const user of Object.values(DEMO_USERS)) {
    if (user.company_id === companyId) {
      await ledger.seedMembership(companyId, user.email, user.role);
    }
  }
}
