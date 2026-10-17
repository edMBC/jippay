import type { AgentDecision, CompanyRules, Invoice, ThreeWayMatch } from "./schemas";
import { ISO20022_STATUS_MAP } from "./schemas";
import { getJurisdictionRules } from "./jurisdictions";
import {
  compositeFingerprint,
  convertToUsd,
  detectPromptInjection,
  detectVendorSpoofing,
  normalizeInvoiceId,
  normalizeText,
  sha256Hex,
} from "./security";

/**
 * Códigos de razón asociados a la calidad documental. Se agrupan para impedir
 * que una factura escalada por calidad insuficiente produzca efectos financieros.
 */
export const DOCUMENT_QUALITY_RULES = new Set([
  "REGLA_CONFIANZA_BAJA",
  "REGLA_CONFIANZA_INVALIDA",
  "REGLA_CONFIANZA_NO_VERIFICABLE",
  "REGLA_CAMPO_AMBIGUO",
  "REGLA_DOCUMENTO_NO_PROCESABLE",
] as const);

export function isDocumentQualityRule(regla: string): boolean {
  return DOCUMENT_QUALITY_RULES.has(
    regla as (typeof DOCUMENT_QUALITY_RULES extends Set<infer T> ? T : never),
  );
}

export interface QualityAssessment {
  ok: boolean;
  regla?: string;
  razon?: string;
}

/**
 * Control determinista de calidad documental (Regla C).
 * - Confianza ausente / no numérica -> no verificable.
 * - NaN / Infinity / fuera de 0-100 -> inválida.
 * - < 75 -> baja.
 * - Campos críticos sin evidencia -> ambigüedad.
 * Cualquiera de estos casos impide la autorización automática (ESCALAR).
 */
export function evaluateDocumentQuality(invoice: Invoice): QualityAssessment {
  if (invoice.documento_no_procesable === true) {
    return {
      ok: false,
      regla: "REGLA_DOCUMENTO_NO_PROCESABLE",
      razon: "No se pudo extraer información financiera suficiente del documento. Requiere revisión humana o entrada manual.",
    };
  }

  const score = invoice.confidence_score;

  if (score == null || typeof score !== "number") {
    return {
      ok: false,
      regla: "REGLA_CONFIANZA_NO_VERIFICABLE",
      razon: "La confianza de extracción no es verificable (ausente o de tipo incorrecto).",
    };
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return {
      ok: false,
      regla: "REGLA_CONFIANZA_INVALIDA",
      razon: `La confianza de extracción es inválida (${score}); debe estar entre 0 y 100.`,
    };
  }
  if (score < 75) {
    return {
      ok: false,
      regla: "REGLA_CONFIANZA_BAJA",
      razon: `La confianza de extracción es ${score}/100, inferior al umbral de 75. Requiere revisión humana.`,
    };
  }

  const criticalFields = invoice.critical_fields;
  if (!criticalFields) {
    return {
      ok: false,
      regla: "REGLA_CAMPO_AMBIGUO",
      razon: "No existe evidencia determinista por campo crítico. Requiere revisión humana.",
    };
  }

  const ambiguous = (Object.keys(criticalFields) as (keyof typeof criticalFields)[]).filter(
    (key) => criticalFields[key] === false,
  );
  if (ambiguous.length > 0) {
    return {
      ok: false,
      regla: "REGLA_CAMPO_AMBIGUO",
      razon: `Campos críticos con evidencia insuficiente: ${ambiguous.join(", ")}. Requiere revisión humana.`,
    };
  }

  return { ok: true };
}

/**
 * Triple Cruce Contable (3-Way Match): proveedor, acuerdo y liquidez.
 * Independiente del orden de reglas y testeable de forma aislada.
 */
export function computeThreeWayMatch(
  invoice: Invoice,
  rules: CompanyRules,
  montoUsd: number,
  processedIds: string[],
  processedFingerprints: string[],
  processedFileHashes: string[],
): ThreeWayMatch {
  const emisorNormalizado = normalizeText(invoice.emisor);
  const proveedores = (rules.proveedores_permitidos ?? []).map(normalizeText);
  const vendorMatch = proveedores.includes(emisorNormalizado);

  const acuerdoExplicito = invoice.monto_acordado;
  const acuerdoPorProveedor = rules.acuerdos_por_proveedor?.[invoice.emisor];
  const montoAcordado =
    acuerdoExplicito != null
      ? acuerdoExplicito
      : acuerdoPorProveedor != null
        ? acuerdoPorProveedor
        : undefined;
  const agreementMatch = montoAcordado == null || montoUsd <= montoAcordado;

  const idNormalizado = normalizeInvoiceId(invoice.id);
  const fingerprint = compositeFingerprint(invoice.emisor, montoUsd, invoice.fecha_vencimiento);
  const fileHash = (invoice.fileHash ?? "").trim().toLowerCase();
  const duplicadoPorId = processedIds.some(
    (id) => normalizeInvoiceId(id) === idNormalizado,
  );
  const duplicadoPorHash =
    fileHash.length > 0 &&
    processedFileHashes.some((h) => h.trim().toLowerCase() === fileHash);
  const duplicadoPorHuella = processedFingerprints.some(
    (fp) => normalizeText(fp) === normalizeText(fingerprint),
  );
  const esDuplicado = duplicadoPorId || duplicadoPorHash || duplicadoPorHuella;

  const budgetLiquidityMatch =
    !esDuplicado && montoUsd <= rules.presupuesto_mensual_restante;

  return {
    vendor_match: vendorMatch,
    agreement_match: agreementMatch,
    budget_liquidity_match: budgetLiquidityMatch,
  };
}

/**
 * Motor determinista de auditoría: cero IA, cero aleatoriedad.
 * Evalúa las reglas de negocio en orden estricto e inflexible:
 *   0. Prompt injection / monto inválido (solo si fiable)       -> FRENAR
 *   1. Duplicado por hash exacto de archivo                     -> FRENAR
 *   2. Calidad documental / confianza insuficiente              -> ESCALAR
 *   3. Duplicado por ID o huella compuesta (datos ya fiables)   -> FRENAR
 *   4. Proveedor no autorizado o spoofing                       -> FRENAR
 *   5. Presupuesto insuficiente                                 -> FRENAR
 *   6. Discrepancia con acuerdo en ERP                          -> ESCALAR
 *   7. Supera límite de aprobación automática                   -> ESCALAR
 *   8. Cumplimiento total                                       -> PAGAR
 */
export function evaluateInvoice(
  invoice: Invoice,
  rules: CompanyRules,
  processedIds: string[],
  processedFingerprints: string[] = [],
  processedFileHashes: string[] = [],
  now: () => Date = () => new Date(),
): AgentDecision {
  const traza: string[] = [];
  const timestamp = now().toISOString();

  const build = (
    estado: AgentDecision["estado"],
    regla: string,
    razon: string,
  ): AgentDecision => {
    // ISO 20022: mapa de veredicto interno a código bancario internacional.
    const iso20022_status = ISO20022_STATUS_MAP[estado];
    const three_way_match = computeThreeWayMatch(
      invoice,
      rules,
      montoUsd,
      processedIds,
      processedFingerprints,
      processedFileHashes,
    );
    // Hash determinista sobre contenido financiero (sin reloj) para verificar integridad.
    const hashPayload = `${invoice.id}|${invoice.emisor}|${montoUsd}|${estado}|${regla}`;
    return {
      invoice_id: invoice.id,
      factura: invoice,
      estado,
      regla_disparada: regla,
      razon,
      traza_evaluacion: traza,
      timestamp,
      iso20022_status,
      three_way_match,
      hash_auditoria: sha256Hex(hashPayload),
    };
  };

  // Conversión multimoneda auditable a USD.
  const conversion = convertToUsd(invoice.monto, invoice.moneda);
  const montoUsd = invoice.monto_usd ?? conversion.monto_usd;
  if (conversion.moneda_original !== "USD") {
    traza.push(`MONEDA: ${conversion.nota}`);
  }

  if (invoice.fecha_vencimiento_inferida === true) {
    traza.push(
      "ADVERTENCIA_FECHA: la factura no incluía fecha de vencimiento; se infirió la fecha de hoy.",
    );
  }

  // Regla 0: seguridad — la detección de prompt injection tiene prioridad máxima.
  const promptInjection =
    detectPromptInjection(invoice.concepto) || invoice.security_alert === true;

  // Un importe solo se considera "inválido" cuando fue extraído de forma fiable.
  // Si el importe es desconocido (sin evidencia), no es un fraude: se deriva a
  // revisión humana en la regla de calidad, no se bloquea como importe inválido.
  const montoDesconocido = invoice.critical_fields?.monto_reliable === false;
  const montoInvalido =
    !montoDesconocido && (!Number.isFinite(invoice.monto) || invoice.monto <= 0);

  traza.push(
    `REGLA_0_SEGURIDAD: ${
      promptInjection
        ? "alerta de seguridad detectada"
        : montoInvalido
          ? "monto inválido"
          : "sin alertas"
    }`,
  );
  if (promptInjection) {
    return build(
      "FRENAR",
      "REGLA_SEGURIDAD_PROMPT_INJECTION",
      `Se detectó un intento de manipulación (prompt injection) en la factura "${invoice.id}". Se frena el pago por seguridad.`,
    );
  }
  if (montoInvalido) {
    return build(
      "FRENAR",
      "REGLA_SEGURIDAD_MONTO_INVALIDO",
      `El monto de la factura "${invoice.id}" no es válido (${invoice.monto}). Se frena el pago.`,
    );
  }

  // Regla 1: duplicado por hash exacto de archivo. Es evidencia fiable e
  // independiente de la calidad de extracción, por lo que puede bloquear antes.
  const fileHash = (invoice.fileHash ?? "").trim().toLowerCase();
  const duplicadoPorHash =
    fileHash.length > 0 &&
    processedFileHashes.some((h) => h.trim().toLowerCase() === fileHash);
  traza.push(`REGLA_1_DUPLICADA_HASH: hash=${duplicadoPorHash ? "SÍ" : "no"}`);
  if (duplicadoPorHash) {
    return build(
      "FRENAR",
      "REGLA_0_DUPLICADA",
      `La factura "${invoice.id}" ya fue procesada (mismo hash de archivo). Se frena para evitar un cobro duplicado.`,
    );
  }

  // Regla 2: calidad documental. Se evalúa ANTES de usar importes, monedas o
  // identidades inciertas en las reglas financieras (proveedor, presupuesto, contrato).
  const quality = evaluateDocumentQuality(invoice);
  traza.push(
    `REGLA_2_CALIDAD: ${quality.ok ? "confianza verificable y campos críticos fiables" : quality.razon ?? "calidad insuficiente"}`,
  );
  if (!quality.ok) {
    return build(
      "ESCALAR",
      quality.regla ?? "REGLA_CONFIANZA_BAJA",
      quality.razon ?? "La calidad documental es insuficiente para autorizar el pago automáticamente.",
    );
  }

  // Regla 3: duplicado por ID o huella compuesta. Solo es concluyente cuando los
  // datos relevantes ya son fiables (la calidad acaba de ser validada).
  const idNormalizado = normalizeInvoiceId(invoice.id);
  const fingerprint = compositeFingerprint(invoice.emisor, montoUsd, invoice.fecha_vencimiento);
  const duplicadoPorId = processedIds.some(
    (id) => normalizeInvoiceId(id) === idNormalizado,
  );
  const duplicadoPorHuella = processedFingerprints.some(
    (fp) => normalizeText(fp) === normalizeText(fingerprint),
  );
  traza.push(
    `REGLA_3_DUPLICADA: id=${duplicadoPorId ? "SÍ" : "no"}, huella=${duplicadoPorHuella ? "SÍ" : "no"}`,
  );
  if (duplicadoPorId || duplicadoPorHuella) {
    const motivo = duplicadoPorId
      ? "mismo ID"
      : "misma huella financiera (emisor + monto + fecha)";
    return build(
      "FRENAR",
      "REGLA_0_DUPLICADA",
      `La factura "${invoice.id}" ya fue procesada (${motivo}). Se frena para evitar un cobro duplicado.`,
    );
  }

  // Regla 4: proveedor autorizado + anti-spoofing. La identidad ya es fiable
  // (emisor_reliable pasó la regla de calidad); un proveedor desconocido por
  // falta de evidencia ya fue escalado, no llega aquí como "no autorizado".
  const emisorNormalizado = normalizeText(invoice.emisor);
  const proveedores = (rules.proveedores_permitidos ?? []).map(normalizeText);
  const proveedorPermitido = proveedores.includes(emisorNormalizado);

  if (!proveedorPermitido) {
    const spoofing = detectVendorSpoofing(invoice.emisor, rules.proveedores_permitidos ?? []);
    if (spoofing.spoofed && spoofing.closest) {
      traza.push(
        `REGLA_4_SPOOFING: "${invoice.emisor}" se parece a "${spoofing.closest}" (distancia ${spoofing.distance})`,
      );
      return build(
        "FRENAR",
        "REGLA_SPOOFING_VENDOR",
        `Alerta de suplantación de proveedor: "${invoice.emisor}" intenta imitar a "${spoofing.closest}" (distancia de Levenshtein ${spoofing.distance}). Se frena el pago.`,
      );
    }
    traza.push(`REGLA_4_PROVEEDOR: "${invoice.emisor}" NO autorizado`);
    return build(
      "FRENAR",
      "REGLA_1_PROVEEDOR",
      `El proveedor "${invoice.emisor}" no está en la lista blanca de proveedores permitidos. Se frena el pago.`,
    );
  }
  traza.push(`REGLA_4_PROVEEDOR: "${invoice.emisor}" autorizado`);

  // Regla 5: presupuesto disponible.
  const presupuestoSuficiente = montoUsd <= rules.presupuesto_mensual_restante;
  traza.push(
    `REGLA_5_PRESUPUESTO: $${montoUsd} vs presupuesto $${rules.presupuesto_mensual_restante}`,
  );
  if (!presupuestoSuficiente) {
    return build(
      "FRENAR",
      "REGLA_2_PRESUPUESTO",
      `El monto $${montoUsd} supera el presupuesto mensual restante de $${rules.presupuesto_mensual_restante}. No hay saldo suficiente.`,
    );
  }

  // Regla 6: discrepancia con acuerdo comercial en ERP.
  const acuerdoExplicito = invoice.monto_acordado;
  const acuerdoPorProveedor = rules.acuerdos_por_proveedor?.[invoice.emisor];
  const montoAcordado =
    acuerdoExplicito != null
      ? acuerdoExplicito
      : acuerdoPorProveedor != null
        ? acuerdoPorProveedor
        : undefined;

  if (montoAcordado != null) {
    const cumpleAcuerdo = montoUsd <= montoAcordado;
    traza.push(`REGLA_6_ACUERDO: $${montoUsd} vs acordado $${montoAcordado}`);
    if (!cumpleAcuerdo) {
      return build(
        "ESCALAR",
        "REGLA_ACUERDO_PREVIO",
        `El monto $${montoUsd} no cuadra con lo acordado para "${invoice.emisor}" (acordado: $${montoAcordado}). Se escala para revisión humana.`,
      );
    }
  } else {
    traza.push("REGLA_6_ACUERDO: sin acuerdo previo registrado");
  }

  // Regla 7: límite de aprobación automática.
  const dentroDelLimite = montoUsd <= rules.limite_monto_automatico;
  traza.push(
    `REGLA_7_LIMITE_AUTO: $${montoUsd} vs límite $${rules.limite_monto_automatico}`,
  );
  if (!dentroDelLimite) {
    return build(
      "ESCALAR",
      "REGLA_3_LIMITE_AUTO",
      `El monto $${montoUsd} supera el límite de aprobación automática de $${rules.limite_monto_automatico}. Requiere aprobación humana.`,
    );
  }

  // Regla 7bis: legislación fiscal de la jurisdicción seleccionada.
  // Es un control aditivo: nunca debilita las reglas anteriores. Refleja en la
  // traza qué normativas locales aplican y escala por retención cuando el monto
  // supera el umbral de la jurisdicción.
  const jurisdiction = getJurisdictionRules(rules.pais);
  if (jurisdiction) {
    const requerimientos = [
      `identificación fiscal: ${jurisdiction.identificacion_fiscal}`,
      jurisdiction.factura_electronica_obligatoria
        ? "factura electrónica obligatoria"
        : "factura electrónica no obligatoria",
    ];
    traza.push(
      `JURISDICCION: ${jurisdiction.nombre} (${jurisdiction.id}) — ${jurisdiction.normativas.join("; ")}`,
    );
    traza.push(`JURISDICCION_REQUISITOS: ${requerimientos.join("; ")}`);

    if (
      jurisdiction.retencion_umbral_usd != null &&
      montoUsd >= jurisdiction.retencion_umbral_usd
    ) {
      return build(
        "ESCALAR",
        "REGLA_JURISDICCION_RETENCION",
        `En ${jurisdiction.nombre}, el monto $${montoUsd} alcanza el umbral de revisión de retención ($${jurisdiction.retencion_umbral_usd}). Se escala para verificar la retención de impuestos aplicable.`,
      );
    }
  }

  // Regla 8: cumplimiento total.
  const saldoRestante = rules.presupuesto_mensual_restante - montoUsd;
  traza.push(`REGLA_8_CUMPLIMIENTO: pago aprobado, saldo restante $${saldoRestante}`);
  return build(
    "PAGAR",
    "APROBACION_AUTOMATICA",
    `Factura validada: proveedor "${invoice.emisor}" autorizado, monto $${montoUsd} USD dentro del límite $${rules.limite_monto_automatico}. Tras el pago quedarán $${saldoRestante} de presupuesto mensual.`,
  );
}
