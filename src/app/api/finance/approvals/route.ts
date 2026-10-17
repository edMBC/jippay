import { z } from "zod";
import { authorizeWithMembership, deniedResponse } from "@/lib/auth/authorize";
import { ensureDemoCompany } from "@/lib/finance/demo-seed";
import { getTransactionalLedger } from "@/lib/finance/factory";
import { sha256Hex } from "@/lib/security";

/**
 * Aprobación/rechazo humano de excepciones escaladas.
 *
 * Segregación de funciones: solo `CONTROLLER_APPROVER` firma excepciones.
 * La empresa e identidad del firmante provienen de la sesión autenticada; los
 * campos `company_id`, `approved_by`, `approver_name` o `role` del cuerpo son
 * ignorados como autoridad.
 */

const ApprovalBodySchema = z.object({
  invoiceId: z.string().min(1, "invoiceId es obligatorio"),
  action: z.enum(["APPROVE", "REJECT"]),
  justification: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(10, "La justificación debe tener al menos 10 caracteres")
        .max(2000, "La justificación no puede superar 2000 caracteres"),
    ),
  evidenceReferences: z.array(z.string()).max(20).optional().default([]),
});

export async function POST(request: Request) {
  const ledger = getTransactionalLedger();

  if (process.env.NODE_ENV === "production") {
    const verification = await ledger.verify();
    if (!verification.ok || !ledger.capabilities.productionSafe) {
      return Response.json(
        { error: "Persistencia transaccional no verificada: aprobación financiera bloqueada" },
        { status: 503 },
      );
    }
  }

  await ensureDemoCompany(ledger);

  const auth = await authorizeWithMembership(ledger, request, ["CONTROLLER_APPROVER"]);
  if (!auth.ok) return deniedResponse(auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsed = ApprovalBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Entrada inválida", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { invoiceId, action, justification, evidenceReferences } = parsed.data;

  const companyId = auth.context.companyId;
  const approverEmail = auth.context.membership.userEmail;

  const invoice = await ledger.getInvoice(companyId, invoiceId);
  if (!invoice) {
    return Response.json({ error: "Factura no encontrada en el ámbito autorizado" }, { status: 404 });
  }

  // Segregación de funciones: el creador no puede aprobar su propia excepción.
  if (invoice.creatorEmail && invoice.creatorEmail.toLowerCase() === approverEmail.toLowerCase()) {
    return Response.json(
      { error: "El creador de la factura no puede aprobar su propia excepción" },
      { status: 403 },
    );
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key") ??
    sha256Hex(`approval|${companyId}|${invoiceId}|${action}|${justification}`);

  const requestHash = sha256Hex(
    JSON.stringify({ companyId, invoiceId, action, justification, evidenceReferences }),
  );

  const result = await ledger.resolveApproval({
    companyId,
    invoiceId,
    action,
    justification,
    evidenceReferences,
    approverEmail,
    approverRole: auth.context.role,
    approverName: auth.context.membership.userEmail.split("@")[0],
    idempotencyKey,
    requestHash,
  });

  switch (result.status) {
    case "approved":
    case "rejected":
      return Response.json({
        ok: true,
        status: result.status,
        record: result.record,
        reservation: result.reservation,
      });
    case "idempotency_replay":
      return Response.json({
        ok: true,
        status: "idempotency_replay",
        record: result.record,
        reservation: null,
      });
    case "idempotency_conflict":
      return Response.json(
        { error: "Conflicto de idempotencia: la clave fue reutilizada con contenido distinto" },
        { status: 409 },
      );
    case "invoice_not_found":
      return Response.json({ error: "Factura no encontrada en el ámbito autorizado" }, { status: 404 });
    case "not_approvable":
      return Response.json({ error: result.reason }, { status: 409 });
    case "not_pending":
      return Response.json(
        { error: "La factura ya no está pendiente de revisión", flowStatus: result.flowStatus },
        { status: 409 },
      );
    default:
      return Response.json({ error: "Resultado de aprobación no reconocido" }, { status: 500 });
  }
}
