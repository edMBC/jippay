import { authorizeWithMembership, deniedResponse } from "@/lib/auth/authorize";
import { ensureDemoCompany } from "@/lib/finance/demo-seed";
import { getTransactionalLedger } from "@/lib/finance/factory";
import type { ApprovalRecord, BudgetReservation, InvoiceRecord } from "@/lib/finance/model";

/**
 * Listado financiero autoritativo del ámbito empresarial autenticado.
 * Solo lectura (CFO, CONTROLLER y AUDITOR). La empresa proviene de la sesión,
 * nunca de un `company_id` enviado por query string.
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

  const [invoices, reservations, approvals] = await Promise.all([
    ledger.listInvoices(companyId),
    ledger.listReservations(companyId),
    ledger.listApprovals(companyId),
  ]);

  const reservationByInvoice = new Map<string, BudgetReservation | undefined>();
  for (const r of reservations) {
    // Conserva la reserva más reciente por factura (estado final).
    reservationByInvoice.set(r.invoiceId, r);
  }
  const approvalByInvoice = new Map<string, ApprovalRecord | undefined>();
  for (const a of approvals) {
    approvalByInvoice.set(a.invoiceId, a);
  }

  const items = invoices.map((inv: InvoiceRecord) => {
    const reservation = reservationByInvoice.get(inv.invoiceId);
    const approval = approvalByInvoice.get(inv.invoiceId);
    return {
      invoiceId: inv.invoiceId,
      emisor: inv.emisor,
      montoUsd: inv.montoUsd,
      moneda: inv.moneda,
      fechaVencimiento: inv.fechaVencimiento,
      fileHash: inv.fileHash,
      estado: inv.estado,
      reglaDisparada: inv.reglaDisparada,
      razon: inv.razon,
      flowStatus: inv.flowStatus,
      reservationStatus: reservation?.status ?? null,
      approvedBy: approval ? `${approval.approverEmail} (${approval.approverRole})` : null,
      approvalAction: approval?.action ?? null,
      justification: approval?.justification ?? null,
      auditHash: approval?.auditHash ?? null,
      createdAt: inv.createdAt,
    };
  });

  return Response.json({ ok: true, companyId, demoMode: !ledger.capabilities.productionSafe, items });
}
