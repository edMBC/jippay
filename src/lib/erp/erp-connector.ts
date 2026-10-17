import type { AgentDecision, CompanyRules, Invoice } from "../schemas";
import { sha256Hex } from "../security";

/**
 * Conector de ERPs (Odoo, SAP, QuickBooks, NetSuite, a2) y CSV.
 * Funciones puras, utilizables tanto en servidor como en cliente.
 */

export type ErpProvider = "odoo" | "sap" | "quickbooks" | "netsuite" | "a2" | "excel";

export interface ErpMasterImport {
  proveedores_permitidos: string[];
  acuerdos_por_proveedor: Record<string, number>;
  presupuesto_mensual_restante?: number;
}

export interface ReconciliationRow {
  Timestamp: string;
  Invoice_ID: string;
  Emisor: string;
  Monto_Original: number;
  Moneda: string;
  Monto_USD: number;
  Decision: string;
  Regla_Activada: string;
  Razon_Explicable: string;
  Hash_Auditoria: string;
}

// ---------------------------------------------------------------------------
// Parseo de CSV robusto (soporta comillas y saltos de línea dentro de campos)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  return rows;
}

function csvToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = (row[index] ?? "").trim();
    });
    return obj;
  });
}

function firstValue(obj: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (value != null && value !== "") return value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Importador de maestro de proveedores (CSV / JSON)
// ---------------------------------------------------------------------------

export function importProviderMaster(
  input: string | Record<string, unknown>,
  baseRules: CompanyRules,
): { rules: CompanyRules; updatedProviders: number; updatedAgreements: number } {
  const records: Record<string, string>[] =
    typeof input === "string" ? csvToObjects(parseCsv(input)) : [input as Record<string, string>];

  const proveedores = new Set<string>(baseRules.proveedores_permitidos);
  const acuerdos: Record<string, number> = { ...(baseRules.acuerdos_por_proveedor ?? {}) };
  let updatedAgreements = 0;

  let presupuesto = baseRules.presupuesto_mensual_restante;

  for (const record of records) {
    const proveedor = firstValue(record, ["proveedor", "proveedores", "vendor", "nombre", "name"]);
    const acuerdoRaw = firstValue(record, [
      "acuerdo",
      "monto_acordado",
      "acuerdo_monto",
      "limite_acuerdo",
      "amount",
    ]);
    const presupuestoRaw = firstValue(record, [
      "presupuesto",
      "presupuesto_mensual",
      "budget",
    ]);

    if (proveedor) {
      proveedores.add(proveedor);
      const acuerdo = parseNumber(acuerdoRaw);
      if (acuerdo != null && acuerdo > 0) {
        acuerdos[proveedor] = acuerdo;
        updatedAgreements++;
      }
    }

    const presupuestoParsed = parseNumber(presupuestoRaw);
    if (presupuestoParsed != null && presupuestoParsed >= 0) {
      presupuesto = presupuestoParsed;
    }
  }

  return {
    rules: {
      ...baseRules,
      proveedores_permitidos: Array.from(proveedores),
      acuerdos_por_proveedor: acuerdos,
      presupuesto_mensual_restante: presupuesto,
    },
    updatedProviders: proveedores.size,
    updatedAgreements,
  };
}

// ---------------------------------------------------------------------------
// Importador de lote de facturas (CSV)
// ---------------------------------------------------------------------------

export function parseInvoiceBatchCsv(csvText: string): Invoice[] {
  const records = csvToObjects(parseCsv(csvText));
  const invoices: Invoice[] = [];

  for (const record of records) {
    const id = firstValue(record, ["id", "invoice_id", "factura", "numero", "numero_factura"]);
    const emisor = firstValue(record, ["emisor", "proveedor", "vendor", "nombre", "name"]);
    const monto = parseNumber(
      firstValue(record, ["monto", "monto_original", "total", "amount", "importe"]),
    );
    const moneda = firstValue(record, ["moneda", "currency"]) || "USD";
    const fecha = firstValue(record, ["fecha_vencimiento", "vencimiento", "due_date", "fecha"]);
    const concepto = firstValue(record, ["concepto", "descripcion", "description"]);

    if (id && emisor && monto != null && monto > 0) {
      invoices.push({
        id,
        emisor,
        monto,
        moneda: moneda.toUpperCase(),
        fecha_vencimiento: fecha || "2026-12-31",
        concepto: concepto || "Factura importada desde ERP",
      });
    }
  }

  return invoices;
}

// ---------------------------------------------------------------------------
// Exportador de conciliación contable (CSV y JSON)
// ---------------------------------------------------------------------------

const RECONCILIATION_HEADERS = [
  "Timestamp",
  "Invoice_ID",
  "Emisor",
  "Monto_Original",
  "Moneda",
  "Monto_USD",
  "Decision",
  "Regla_Activada",
  "Razon_Explicable",
  "Hash_Auditoria",
] as const;

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function decisionsToReconciliationRows(decisions: AgentDecision[]): ReconciliationRow[] {
  return decisions.map((decision) => {
    const factura = decision.factura;
    return {
      Timestamp: decision.timestamp,
      Invoice_ID: decision.invoice_id,
      Emisor: factura?.emisor ?? "",
      Monto_Original: factura?.monto ?? 0,
      Moneda: factura?.moneda ?? "USD",
      Monto_USD: factura?.monto_usd ?? factura?.monto ?? 0,
      Decision: decision.estado,
      Regla_Activada: decision.regla_disparada,
      Razon_Explicable: decision.razon,
      Hash_Auditoria: decision.hash_auditoria ?? sha256Hex(decision.invoice_id + decision.timestamp),
    };
  });
}

export function exportReconciliationCsv(decisions: AgentDecision[]): string {
  const rows = decisionsToReconciliationRows(decisions);
  const lines = [RECONCILIATION_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(RECONCILIATION_HEADERS.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

export function exportReconciliationJson(decisions: AgentDecision[]): string {
  const rows = decisionsToReconciliationRows(decisions);
  return JSON.stringify({ generado: new Date().toISOString(), total: rows.length, filas: rows }, null, 2);
}

// ---------------------------------------------------------------------------
// Plantillas simuladas de ERP
// ---------------------------------------------------------------------------

export function getErpTemplate(provider: ErpProvider): string {
  switch (provider) {
    case "odoo":
      return [
        "proveedor,acuerdo,monto_acordado",
        "DevCorp,800,800",
        "LatamDesign,2000,2000",
        "CloudHost,1500,1500",
        "AndesConsulting,1200,1200",
        "",
      ].join("\n");
    case "sap":
      return [
        "vendor,amount,currency",
        "DevCorp,800,USD",
        "LatamDesign,2000,USD",
        "CloudHost,1500,USD",
        "AndesConsulting,1200,USD",
        "",
      ].join("\n");
    case "quickbooks":
      return [
        "name,acuerdo_monto",
        "DevCorp,800",
        "LatamDesign,2000",
        "CloudHost,1500",
        "AndesConsulting,1200",
        "",
      ].join("\n");
    case "netsuite":
      return [
        "proveedor,limite_acuerdo",
        "DevCorp,800",
        "LatamDesign,2000",
        "CloudHost,1500",
        "AndesConsulting,1200",
        "",
      ].join("\n");
    case "a2":
      return [
        "proveedor,monto_acordado",
        "DevCorp,800",
        "LatamDesign,2000",
        "CloudHost,1500",
        "AndesConsulting,1200",
        "",
      ].join("\n");
    case "excel":
      return [
        "proveedor,acuerdo",
        "DevCorp,800",
        "LatamDesign,2000",
        "CloudHost,1500",
        "AndesConsulting,1200",
        "",
      ].join("\n");
  }
}

function parseNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
