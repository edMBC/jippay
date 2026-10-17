import { authorizeWithMembership, deniedResponse, type AuthorizedContext } from "@/lib/auth/authorize";
import type { SessionUser } from "@/lib/auth/roles";
import { ensureDemoCompany } from "@/lib/finance/demo-seed";
import { getTransactionalLedger } from "@/lib/finance/factory";
import { commitInvoiceTransaction, type CommitTransactionOutcome } from "@/lib/finance/orchestrator";
import type { TransactionalLedger } from "@/lib/finance/ledger";
import { extractInvoiceFromText } from "@/lib/extractor";
import { ingestFile } from "@/lib/multimodal-ingestor";
import type { Invoice } from "@/lib/schemas";
import { sanitizeInvoiceInput, sha256Hex } from "@/lib/security";

/**
 * Finalización financiera transaccional (punto de entrada autoritativo).
 *
 * La empresa y las reglas se derivan de la sesión autenticada y del almacén del
 * servidor (nunca de un `company_id`, `rules`, `invoice`, `PAGAR`/`ESCALAR`/
 * `FRENAR`, `confidence_score` o `approved_by` enviados por el navegador). La
 * extracción se repite en el servidor.
 *
 * Formatos soportados:
 * - JSON `{ rawText }` — factura en texto.
 * - JSON `{ batch: string[] }` — lote de textos (resultado por elemento).
 * - FormData `{ file }` — PDF/imagen/texto; hash SHA-256 calculado en servidor.
 */

type OutcomeShape = Extract<CommitTransactionOutcome, { ok: true }>;

function normalizeOutcome(outcome: CommitTransactionOutcome, invoiceId: string) {
  if (!outcome.ok) {
    return { ok: false, error: outcome.reason, httpStatus: outcome.httpStatus };
  }
  const o = outcome as OutcomeShape;
  return {
    ok: true,
    replay: o.replay,
    invoiceId,
    decision: {
      estado: o.decision.estado,
      regla_disparada: o.decision.regla_disparada,
      razon: o.decision.razon,
    },
    reservationKind: o.reservationKind,
    result: o.result,
    flowStatus: flowStatusFor(o),
    reservationStatus: reservationStatusFor(o),
    availableCents: o.availableCents,
    availableUsd: (o.availableCents / 100).toFixed(2),
    demoMode: o.demoMode,
    capabilities: o.capabilities,
  };
}

function flowStatusFor(o: OutcomeShape): string {
  if (o.result.status === "committed" && o.result.decision.estado === "PAGAR") return "APPROVED_FOR_PAYMENT";
  if (o.result.status === "committed" && o.result.decision.estado === "ESCALAR") return "PENDING_REVIEW";
  if (o.result.status === "committed") return "NOT_APPROVABLE";
  return "NOT_APPROVABLE";
}

function reservationStatusFor(o: OutcomeShape): string | null {
  if (o.result.status === "committed" && o.result.reservation) return o.result.reservation.status;
  return null;
}

function toSessionUser(context: AuthorizedContext): SessionUser {
  return {
    email: context.membership.userEmail,
    role: context.role as SessionUser["role"],
    company_id: context.companyId,
    auth_user_id: context.identity.userId,
    identity_provider: context.identity.provider,
    name: context.membership.userEmail.split("@")[0],
  };
}

async function processDocument(
  ledger: TransactionalLedger,
  user: SessionUser,
  companyId: string,
  invoice: Invoice,
  requestContent: string,
  idempotencyKey: string,
  source: string,
): Promise<ReturnType<typeof normalizeOutcome>> {
  const outcome = await commitInvoiceTransaction({
    ledger,
    user,
    invoice,
    idempotencyKey,
    requestContent,
    source,
  });
  return normalizeOutcome(outcome, invoice.id);
}

export async function POST(request: Request) {
  const ledger = getTransactionalLedger();

  if (process.env.NODE_ENV === "production") {
    const verification = await ledger.verify();
    if (!verification.ok || !ledger.capabilities.productionSafe) {
      return Response.json(
        { error: "Persistencia transaccional no verificada: operación financiera bloqueada" },
        { status: 503 },
      );
    }
  }

  await ensureDemoCompany(ledger);

  const auth = await authorizeWithMembership(ledger, request, ["CFO_ADMIN", "CONTROLLER_APPROVER"]);
  if (!auth.ok) return deniedResponse(auth.status);

  const companyId = auth.context.companyId;
  const user = toSessionUser(auth.context);

  const serverRules = await ledger.getCompanyRules(companyId);
  if (!serverRules) {
    return Response.json({ error: "Reglas corporativas no configuradas" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  // --- Archivo (multipart/form-data) ---
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: "FormData inválido" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Debe enviar un archivo en el campo 'file'" }, { status: 400 });
    }
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const { invoice } = await ingestFile(buffer, file.name || "factura");
      const idempotencyKey = request.headers.get("Idempotency-Key") ?? sha256Hex(`file|${companyId}|${invoice.fileHash ?? buffer.byteLength}`);
      const result = await processDocument(ledger, user, companyId, invoice, `file:${file.name}:${invoice.fileHash ?? ""}`, idempotencyKey, "finance-reserve-file");
      return Response.json(result, { status: result.ok ? 200 : (result as { httpStatus?: number }).httpStatus ?? 400 });
    } catch (error) {
      return Response.json(
        { error: "No se pudo procesar el archivo", detail: error instanceof Error ? error.message : String(error) },
        { status: 422 },
      );
    }
  }

  // --- JSON (texto o lote) ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsed = body as { rawText?: unknown; batch?: unknown };

  // Lote de facturas de texto.
  if (Array.isArray(parsed.batch)) {
    const items = parsed.batch.map((v) => String(v));
    const results: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      const rawText = items[i];
      if (!rawText.trim()) {
        results.push({ ok: false, error: "Elemento vacío" });
        continue;
      }
      try {
        const invoice = await extractInvoiceFromText(rawText, serverRules);
        const security = sanitizeInvoiceInput(rawText);
        const invoiceWithSecurity = {
          ...invoice,
          security_alert: invoice.security_alert === true || security.alert,
        };
        const idempotencyKey = sha256Hex(`batch|${companyId}|${i}|${rawText}`);
        results.push(
          await processDocument(ledger, user, companyId, invoiceWithSecurity, rawText, idempotencyKey, "finance-reserve-batch"),
        );
      } catch (error) {
        results.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return Response.json({ ok: true, batch: true, results });
  }

  // Factura individual de texto.
  const rawText = typeof parsed.rawText === "string" ? parsed.rawText : "";
  if (!rawText.trim()) {
    return Response.json({ error: "rawText es obligatorio" }, { status: 400 });
  }

  try {
    const invoice = await extractInvoiceFromText(rawText, serverRules);
    const security = sanitizeInvoiceInput(rawText);
    const invoiceWithSecurity = {
      ...invoice,
      security_alert: invoice.security_alert === true || security.alert,
    };
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? sha256Hex(`text|${companyId}|${rawText}`);
    const result = await processDocument(ledger, user, companyId, invoiceWithSecurity, rawText, idempotencyKey, "finance-reserve");
    return Response.json(result, { status: result.ok ? 200 : (result as { httpStatus?: number }).httpStatus ?? 400 });
  } catch (error) {
    return Response.json(
      { error: "Error en la finalización financiera", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
