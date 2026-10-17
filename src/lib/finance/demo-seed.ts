import { DEMO_USERS } from "../auth/session";
import { defaultCompanyRules } from "../mock-data";
import type { TransactionalLedger } from "./ledger";

/**
 * Siembra explícita y acotada para desarrollo/demo. NO se ejecuta en producción
 * ni automáticamente durante el build, el inicio o los tests: se invoca de forma
 * perezosa solo cuando una operación de demo lo requiere y `NODE_ENV !== production`.
 */
export async function ensureDemoCompany(ledger: TransactionalLedger): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.ALLOW_DEMO_SEED === "false") return;

  const companyId = "jippay-us";
  if (await ledger.getCompany(companyId)) return;

  const period = new Date().toISOString().slice(0, 7);
  await ledger.seedCompany(companyId, "Jippay US", defaultCompanyRules, period);

  for (const user of Object.values(DEMO_USERS)) {
    if (user.company_id === companyId) {
      await ledger.seedMembership(companyId, user.email, user.role);
    }
  }
}
