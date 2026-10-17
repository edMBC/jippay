/**
 * Catálogo de legislaciones fiscales por país.
 *
 * Cada jurisdicción aporta parámetros base que el motor determinista refleja en
 * su traza y, cuando procede, en el veredicto:
 * - Formato de identificación fiscal esperado.
 * - Exigencia de facturación electrónica local.
 * - Umbral de revisión de retención de impuestos.
 * - Normativas locales / SOX aplicables (para la traza de auditoría).
 *
 * Los valores son parámetros de demo/configuración, no asesoría fiscal: la
 * aplicación no sustituye la revisión contable del cliente.
 */

export interface JurisdictionRules {
  /** Código ISO (US, CO, CL, MX, ES, VE, ...). */
  id: string;
  nombre: string;
  /** Identificación fiscal esperada (EIN, NIT, RUT, RFC, NIF, RIF, ...). */
  identificacion_fiscal: string;
  /** True si la jurisdicción exige facturación electrónica. */
  factura_electronica_obligatoria: boolean;
  /**
   * Monto en USD a partir del cual el motor escala por revisión de retención.
   * `null` cuando no se aplica un umbral general.
   */
  retencion_umbral_usd: number | null;
  /** Normativas locales / SOX reflejadas en la traza de auditoría. */
  normativas: string[];
}

export const JURISDICTIONS: JurisdictionRules[] = [
  {
    id: "US",
    nombre: "Estados Unidos",
    identificacion_fiscal: "EIN",
    factura_electronica_obligatoria: false,
    retencion_umbral_usd: null,
    normativas: ["SOX (segregación de funciones)", "IRS 1099"],
  },
  {
    id: "CO",
    nombre: "Colombia",
    identificacion_fiscal: "NIT",
    factura_electronica_obligatoria: true,
    retencion_umbral_usd: 1000,
    normativas: ["DIAN — factura electrónica", "Retención en la fuente"],
  },
  {
    id: "CL",
    nombre: "Chile",
    identificacion_fiscal: "RUT",
    factura_electronica_obligatoria: true,
    retencion_umbral_usd: null,
    normativas: ["SII — factura electrónica", "Retención de honorarios"],
  },
  {
    id: "MX",
    nombre: "México",
    identificacion_fiscal: "RFC",
    factura_electronica_obligatoria: true,
    retencion_umbral_usd: 2500,
    normativas: ["SAT — CFDI", "Retención ISR / IVA"],
  },
  {
    id: "ES",
    nombre: "España",
    identificacion_fiscal: "NIF",
    factura_electronica_obligatoria: true,
    retencion_umbral_usd: null,
    normativas: ["VeriFactu", "Retención IRPF"],
  },
  {
    id: "VE",
    nombre: "Venezuela",
    identificacion_fiscal: "RIF",
    factura_electronica_obligatoria: true,
    retencion_umbral_usd: null,
    normativas: ["SENIAT — factura fiscal", "Retención IVA"],
  },
];

/** Devuelve las reglas de una jurisdicción por código ISO, o `null` si no aplica. */
export function getJurisdictionRules(pais?: string): JurisdictionRules | null {
  if (!pais) return null;
  const code = pais.trim().toUpperCase();
  return JURISDICTIONS.find((j) => j.id === code) ?? null;
}

/** Lista de jurisdicciones para selectores de UI (configuración y demo). */
export function listJurisdictions(): JurisdictionRules[] {
  return JURISDICTIONS;
}
