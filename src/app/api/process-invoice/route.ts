import { extractInvoiceFromText } from "@/lib/extractor";
import { evaluateInvoice } from "@/lib/engine";
import { CompanyRulesSchema, InvoiceSchema } from "@/lib/schemas";
import { compositeFingerprint, sanitizeInvoiceInput } from "@/lib/security";
import { persistDecision } from "@/lib/db/adapters";
import { authorize, deniedResponse } from "@/lib/auth/authorize";

export async function POST(request: Request) {
  const auth = authorize(request, ["CFO_ADMIN", "CONTROLLER_APPROVER"]);
  if (!auth.ok) return deniedResponse(auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsedBody = body as {
    rawText?: unknown;
    rules?: unknown;
    processedIds?: unknown;
    processedFingerprints?: unknown;
    processedFileHashes?: unknown;
  };

  const rawText = typeof parsedBody.rawText === "string" ? parsedBody.rawText : "";
  if (!rawText.trim()) {
    return Response.json({ error: "rawText es obligatorio" }, { status: 400 });
  }

  const rulesResult = CompanyRulesSchema.safeParse(parsedBody.rules);
  if (!rulesResult.success) {
    return Response.json(
      { error: "Reglas de empresa inválidas", details: rulesResult.error.flatten() },
      { status: 400 },
    );
  }

  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => String(v)) : [];

  const processedIds = asStringArray(parsedBody.processedIds);
  const processedFingerprints = asStringArray(parsedBody.processedFingerprints);
  const processedFileHashes = asStringArray(parsedBody.processedFileHashes);

  try {
    const invoice = await extractInvoiceFromText(rawText, rulesResult.data);
    const security = sanitizeInvoiceInput(rawText);
    const invoiceWithSecurity = {
      ...invoice,
      security_alert: invoice.security_alert === true || security.alert,
    };
    const invoiceResult = InvoiceSchema.safeParse(invoiceWithSecurity);
    if (!invoiceResult.success) {
      return Response.json(
        { error: "La factura extraída no cumple el esquema", details: invoiceResult.error.flatten() },
        { status: 422 },
      );
    }

    const decision = evaluateInvoice(
      invoiceResult.data,
      rulesResult.data,
      processedIds,
      processedFingerprints,
      processedFileHashes,
    );

    await persistDecision({
      invoice_id: decision.invoice_id,
      estado: decision.estado,
      regla_disparada: decision.regla_disparada,
      razon: decision.razon,
      timestamp: decision.timestamp,
      hash_auditoria: decision.hash_auditoria,
      invoice: invoiceResult.data,
      source: "process-invoice",
    });

    return Response.json({
      invoice: invoiceResult.data,
      decision,
      fingerprint: compositeFingerprint(
        invoiceResult.data.emisor,
        invoiceResult.data.monto_usd ?? invoiceResult.data.monto,
        invoiceResult.data.fecha_vencimiento,
      ),
    });
  } catch {
    return Response.json({ error: "Error procesando la factura" }, { status: 500 });
  }
}
