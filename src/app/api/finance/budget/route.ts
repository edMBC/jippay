import { authorizeWithMembership, deniedResponse } from "@/lib/auth/authorize";
import { ensureDemoCompany } from "@/lib/finance/demo-seed";
import { getTransactionalLedger } from "@/lib/finance/factory";

/**
 * Resumen presupuestario autoritativo (solo lectura).
 * Importes en centavos y en USD, derivados del ledger (no de localStorage).
 */
export async function GET(request: Request) {
  const ledger = getTransactionalLedger();
  await ensureDemoCompany(ledger);

  const auth = await authorizeWithMembership(ledger, request, [
    "CFO_ADMIN",
    "CONTROLLER_APPROVER",
    "AUDITOR_VIEWER",
  ]);
  if (!auth.ok) return deniedResponse(auth.status);

  const companyId = auth.context.companyId;

  const period = new Date().toISOString().slice(0, 7);
  const snapshot = await ledger.getBudgetSnapshot(companyId, period);

  return Response.json({
    ok: true,
    companyId,
    period,
    demoMode: !ledger.capabilities.productionSafe,
    approvedCents: snapshot.approvedCents,
    consumedCents: snapshot.consumedCents,
    reservedCents: snapshot.reservedCents,
    availableCents: snapshot.availableCents,
    approvedUsd: (snapshot.approvedCents / 100).toFixed(2),
    consumedUsd: (snapshot.consumedCents / 100).toFixed(2),
    reservedUsd: (snapshot.reservedCents / 100).toFixed(2),
    availableUsd: (snapshot.availableCents / 100).toFixed(2),
  });
}
