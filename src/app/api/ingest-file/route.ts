import { evaluateInvoice } from "@/lib/engine";
import { ingestFile } from "@/lib/multimodal-ingestor";
import { CompanyRulesSchema } from "@/lib/schemas";
import { compositeFingerprint } from "@/lib/security";
import { persistDecision } from "@/lib/db/adapters";
import { authorize, deniedResponse } from "@/lib/auth/authorize";

export async function POST(request: Request) {
  const auth = authorize(request, ["CFO_ADMIN", "CONTROLLER_APPROVER"]);
  if (!auth.ok) return deniedResponse(auth.status);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Se requiere FormData con un archivo" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Debe enviar un archivo en el campo 'file'" }, { status: 400 });
  }

  const rulesRaw = formData.get("rules");
  let rulesResult;
  try {
    rulesResult = CompanyRulesSchema.safeParse(
      rulesRaw ? JSON.parse(String(rulesRaw)) : {},
    );
  } catch {
    rulesResult = CompanyRulesSchema.safeParse({});
  }

  const effectiveRules = rulesResult.success
    ? rulesResult.data
    : {
        limite_monto_automatico: 1000,
        presupuesto_mensual_restante: 5000,
        proveedores_permitidos: ["DevCorp", "LatamDesign", "CloudHost", "AndesConsulting"],
      };

  const processedIds = parseStringArray(formData.get("processedIds"));
  const processedFingerprints = parseStringArray(formData.get("processedFingerprints"));
  const processedHashes = parseStringArray(formData.get("processedFileHashes"));

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { invoice, fileHash, fileName, mimeType, rawText } = await ingestFile(
      buffer,
      file.name || "factura.pdf",
    );

    const decision = evaluateInvoice(
      invoice,
      effectiveRules,
      processedIds,
      processedFingerprints,
      processedHashes,
    );

    await persistDecision({
      invoice_id: decision.invoice_id,
      estado: decision.estado,
      regla_disparada: decision.regla_disparada,
      razon: decision.razon,
      timestamp: decision.timestamp,
      hash_auditoria: decision.hash_auditoria,
      invoice,
      fileHash,
      fileName,
      source: "ingest-file",
    });

    return Response.json({
      ok: true,
      invoice,
      decision,
      fileHash,
      fileName,
      mimeType,
      fingerprint: compositeFingerprint(invoice.emisor, invoice.monto_usd ?? invoice.monto, invoice.fecha_vencimiento),
      rawText,
    });
  } catch (error) {
    return Response.json(
      {
        error: "No se pudo procesar el archivo",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 422 },
    );
  }
}

function parseStringArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}
