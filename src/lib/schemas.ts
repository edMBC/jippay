import { z } from "zod";

/**
 * Confianza por campo crítico. Complementa a `confidence_score` y representa
 * la evidencia determinista (presencia, tipo, formato, procedencia) de cada
 * dato indispensable para decidir sin ambigüedad.
 */
export const CriticalFieldsSchema = z.object({
  emisor_reliable: z.boolean().describe("La identidad del proveedor tiene evidencia fiable"),
  monto_reliable: z.boolean().describe("El importe tiene evidencia fiable y valor positivo"),
  moneda_reliable: z.boolean().describe("La moneda original fue identificada (no asumida)"),
  id_reliable: z.boolean().describe("El número comercial/ID es fiable para deduplicar"),
  fecha_reliable: z.boolean().describe("La fecha de vencimiento fue extraída (no inferida)"),
});

export type CriticalFields = z.infer<typeof CriticalFieldsSchema>;

/**
 * Contrato de entrada: una factura extraída de un texto crudo
 * (correo, PDF en texto, mensaje de Slack/WhatsApp) o de un archivo.
 */
export const InvoiceSchema = z.object({
  id: z.string().describe("Identificador único o número de la factura, ej. INV-001"),
  emisor: z.string().describe("Nombre de la empresa o contratista que emite el cobro"),
  monto: z.number().positive().describe("Monto total a pagar en valor numérico"),
  moneda: z.string().default("USD").describe("Código ISO de la moneda, ej. USD, COP, MXN"),
  fecha_vencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha_vencimiento debe usar el formato YYYY-MM-DD")
    .describe("Fecha de vencimiento en formato YYYY-MM-DD"),
  concepto: z.string().describe("Descripción breve del servicio o producto cobrado"),
  monto_acordado: z
    .number()
    .optional()
    .describe("Monto previamente acordado con el proveedor, si existe"),
  extraction_engine: z
    .enum(["deepseek-llm", "deterministic-fallback"])
    .optional()
    .describe("Motor que extrajo la factura (LLM contextual o fallback determinista)"),
  agent_reasoning: z
    .string()
    .optional()
    .describe("Explicación de cómo el agente interpretó el documento y el proveedor"),
  confidence_score: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Confianza del extractor en la interpretación (0-100)"),
  system_prompt_preview: z
    .string()
    .optional()
    .describe("Resumen del contexto de reglas inyectado en esa ejecución"),
  fecha_vencimiento_inferida: z
    .boolean()
    .optional()
    .describe("Verdadero si la fecha de vencimiento no aparecía en el documento y se infirió"),
  moneda_inferida: z
    .boolean()
    .optional()
    .describe("Verdadero si la moneda no se detectó en el documento y se asumió USD"),
  critical_fields: CriticalFieldsSchema.optional().describe(
    "Evidencia por campo crítico calculada de forma determinista",
  ),
  documento_no_procesable: z
    .boolean()
    .optional()
    .describe("Verdadero si no se pudo extraer información financiera suficiente del documento"),
  security_alert: z.boolean().optional(),
  monto_usd: z.number().nonnegative().optional(),
  tasa_cambio: z.number().optional(),
  fileHash: z.string().optional(),
  fileName: z.string().optional(),
});

/**
 * Reglas de la empresa: las fronteras inflexibles del agente auditor.
 */
export const CompanyRulesSchema = z.object({
  limite_monto_automatico: z.number().nonnegative(),
  presupuesto_mensual_restante: z.number().nonnegative(),
  proveedores_permitidos: z.array(z.string()),
  acuerdos_por_proveedor: z.record(z.string(), z.number()).optional(),
});

/**
 * Triple Cruce Contable (3-Way Match) contra el maestro del ERP.
 */
export const ThreeWayMatchSchema = z.object({
  vendor_match: z.boolean().describe("Existe en el maestro de proveedores y pasó anti-spoofing"),
  agreement_match: z.boolean().describe("Cumple con el SLA / monto máximo acordado"),
  budget_liquidity_match: z.boolean().describe("Cobro único y existe saldo presupuestario"),
});

export type ThreeWayMatch = z.infer<typeof ThreeWayMatchSchema>;

/**
 * ISO 20022: equivalencia de la decisión interna a códigos bancarios internacionales.
 */
export const ISO20022_STATUS_MAP = {
  PAGAR: "ACCP",
  ESCALAR: "PDNG",
  FRENAR: "RJCT",
} as const;

export type Iso20022Status = (typeof ISO20022_STATUS_MAP)[keyof typeof ISO20022_STATUS_MAP];

/**
 * Contrato de salida: la decisión auditable y explicada del agente.
 */
export const AgentDecisionSchema = z.object({
  invoice_id: z.string(),
  factura: InvoiceSchema.optional(),
  estado: z.enum(["PAGAR", "ESCALAR", "FRENAR"]),
  regla_disparada: z.string(),
  razon: z.string(),
  traza_evaluacion: z.array(z.string()),
  timestamp: z.string(),
  iso20022_status: z.enum(["ACCP", "PDNG", "RJCT"]).optional(),
  three_way_match: ThreeWayMatchSchema.optional(),
  hash_auditoria: z.string().optional(),
  approved_by: z.string().optional().describe("Usuario y rol que firmó una aprobación escalada"),
  approval_note: z.string().optional().describe("Nota forense de la aprobación o rechazo humano"),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
export type CompanyRules = z.infer<typeof CompanyRulesSchema>;
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

