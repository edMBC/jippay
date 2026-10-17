import { getErpTemplate, importProviderMaster, type ErpProvider } from "@/lib/erp/erp-connector";
import { CompanyRulesSchema } from "@/lib/schemas";
import { authorize, deniedResponse } from "@/lib/auth/authorize";

export async function POST(request: Request) {
  const auth = authorize(request, ["CFO_ADMIN"]);
  if (!auth.ok) return deniedResponse(auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido" }, { status: 400 });
  }

  const parsed = body as {
    provider?: unknown;
    csv?: unknown;
    rules?: unknown;
  };

  const rulesResult = CompanyRulesSchema.safeParse(parsed.rules);
  if (!rulesResult.success) {
    return Response.json(
      { error: "Reglas de empresa inválidas", details: rulesResult.error.flatten() },
      { status: 400 },
    );
  }

  const provider = typeof parsed.provider === "string" ? (parsed.provider as ErpProvider) : null;
  let csvInput: string | undefined;

  if (typeof parsed.csv === "string" && parsed.csv.trim()) {
    csvInput = parsed.csv;
  } else if (provider) {
    csvInput = getErpTemplate(provider);
  }

  if (!csvInput) {
    return Response.json(
      { error: "Debe enviar 'csv' o un 'provider' de ERP (odoo, sap, quickbooks, netsuite, a2, excel)" },
      { status: 400 },
    );
  }

  const result = importProviderMaster(csvInput, rulesResult.data);

  return Response.json({
    ok: true,
    updatedProviders: result.updatedProviders,
    updatedAgreements: result.updatedAgreements,
    rules: result.rules,
  });
}
