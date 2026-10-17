"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  exportReconciliationCsv,
  exportReconciliationJson,
} from "./erp/erp-connector";
import { defaultCompanyRules, sampleRawInvoices } from "./mock-data";
import type { AgentDecision, CompanyRules } from "./schemas";
import type { SessionUser, UserRole } from "./auth/roles";

export type HumanAction = "APROBADO" | "RECHAZADO" | null;

/** Resultado de enviar una aprobación/rechazo al servidor. */
export interface ApprovalSubmitResult {
  ok: boolean;
  error?: string;
  flowStatus?: "APPROVED_FOR_PAYMENT" | "REJECTED";
  approvedBy?: string;
}

export interface DecisionRecord {
  decision: AgentDecision;
  rawText: string;
  humanAction: HumanAction;
  flowStatus?: string;
  reservationStatus?: string | null;
}

/** Factura financiera confirmada devuelta por el backend. */
export interface FinancialItem {
  invoiceId: string;
  emisor: string;
  montoUsd: number;
  moneda: string;
  fechaVencimiento: string;
  fileHash: string | null;
  estado: string;
  reglaDisparada: string;
  razon: string;
  flowStatus: string;
  reservationStatus: string | null;
  approvedBy: string | null;
  approvalAction: "APPROVE" | "REJECT" | null;
  justification: string | null;
  createdAt: string;
}

/** Resumen presupuestario autoritativo (del ledger, no de localStorage). */
export interface BudgetSummary {
  demoMode: boolean;
  approvedCents: number;
  consumedCents: number;
  reservedCents: number;
  availableCents: number;
  approvedUsd: string;
  consumedUsd: string;
  reservedUsd: string;
  availableUsd: string;
}

export interface DbHealth {
  ok: boolean;
  motor: { estado: string; ia: string };
  adaptadores: {
    adapter: string;
    ok: boolean;
    latencyMs: number;
    mode: string;
    detail?: string;
    error?: string;
  }[];
  timestamp: string;
}

export interface ErpSyncResult {
  updatedProviders: number;
  updatedAgreements: number;
  rules: CompanyRules;
}

export interface SnapshotData {
  rules: CompanyRules;
  decisions: DecisionRecord[];
  processedIds: string[];
  processedFingerprints: string[];
  processedFileHashes: string[];
}

interface StoreValue {
  rules: CompanyRules;
  decisions: DecisionRecord[];
  processedIds: string[];
  processedFingerprints: string[];
  processedFileHashes: string[];
  loading: boolean;
  dbHealth: DbHealth | null;
  /** Presupuesto autoritativo del ledger (null si no se ha hidratado). */
  budget: BudgetSummary | null;
  /** True si el backend opera en modo demostración (sin persistencia transaccional). */
  demoMode: boolean;
  updateRules: (patch: Partial<CompanyRules>) => void;
  resetRules: () => void;
  processText: (rawText: string) => Promise<AgentDecision | null>;
  processFile: (file: File) => Promise<AgentDecision | null>;
  processBatch: () => Promise<void>;
  submitApproval: (
    record: DecisionRecord,
    action: Exclude<HumanAction, null>,
    justification: string,
  ) => Promise<ApprovalSubmitResult>;
  hydrateFinancials: () => Promise<void>;
  clearDecisions: () => void;
  erpSync: (provider?: string, csv?: string) => Promise<ErpSyncResult | null>;
  checkDbHealth: () => Promise<void>;
  exportCsv: () => string;
  exportJson: () => string;
  exportSnapshot: () => string;
  importSnapshot: (data: SnapshotData) => void;
  user: SessionUser | null;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<SessionUser | null>;
  loginDemo: (role: UserRole) => Promise<SessionUser | null>;
  logout: () => Promise<void>;
}

const STORAGE_KEYS = {
  rules: "jippay_rules_v2",
  decisions: "jippay_decisions_v2",
  processedIds: "jippay_processed_ids_v2",
  processedFingerprints: "jippay_processed_fingerprints_v2",
  processedFileHashes: "jippay_processed_hashes_v2",
} as const;

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return fallback;
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistencia no crítica.
  }
}

const StoreContext = createContext<StoreValue | null>(null);

/** Convierte un ítem financiero del backend en un registro visual de la terminal. */
function toDecisionRecord(item: FinancialItem): DecisionRecord {
  return {
    rawText: "",
    humanAction:
      item.approvalAction === "APPROVE"
        ? "APROBADO"
        : item.approvalAction === "REJECT"
          ? "RECHAZADO"
          : null,
    flowStatus: item.flowStatus,
    reservationStatus: item.reservationStatus,
    decision: {
      invoice_id: item.invoiceId,
      estado: item.estado as AgentDecision["estado"],
      regla_disparada: item.reglaDisparada,
      razon: item.razon,
      timestamp: item.createdAt,
      approved_by: item.approvedBy ?? undefined,
      approval_note: item.justification ?? undefined,
      factura: {
        id: item.invoiceId,
        emisor: item.emisor,
        monto: item.montoUsd,
        monto_usd: item.montoUsd,
        moneda: item.moneda,
        fecha_vencimiento: item.fechaVencimiento,
        concepto: item.razon,
        fileHash: item.fileHash ?? undefined,
      },
    } as AgentDecision,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<CompanyRules>(() =>
    load(STORAGE_KEYS.rules, defaultCompanyRules),
  );
  const [decisions, setDecisions] = useState<DecisionRecord[]>(() =>
    load(STORAGE_KEYS.decisions, []),
  );
  const [processedIds, setProcessedIds] = useState<string[]>(() =>
    load(STORAGE_KEYS.processedIds, []),
  );
  const [processedFingerprints, setProcessedFingerprints] = useState<string[]>(() =>
    load(STORAGE_KEYS.processedFingerprints, []),
  );
  const [processedFileHashes, setProcessedFileHashes] = useState<string[]>(() =>
    load(STORAGE_KEYS.processedFileHashes, []),
  );
  const [loading, setLoading] = useState(false);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => persist(STORAGE_KEYS.rules, rules), [rules]);
  useEffect(() => persist(STORAGE_KEYS.decisions, decisions), [decisions]);
  useEffect(() => persist(STORAGE_KEYS.processedIds, processedIds), [processedIds]);
  useEffect(
    () => persist(STORAGE_KEYS.processedFingerprints, processedFingerprints),
    [processedFingerprints],
  );
  useEffect(
    () => persist(STORAGE_KEYS.processedFileHashes, processedFileHashes),
    [processedFileHashes],
  );

  const updateRules = useCallback((patch: Partial<CompanyRules>) => {
    setRules((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetRules = useCallback(() => {
    setRules(defaultCompanyRules);
    setDecisions([]);
    setProcessedIds([]);
    setProcessedFingerprints([]);
    setProcessedFileHashes([]);
  }, []);

  const clearDecisions = useCallback(() => {
    setDecisions([]);
    setProcessedIds([]);
    setProcessedFingerprints([]);
    setProcessedFileHashes([]);
  }, []);

  // Hidratación autoritativa desde el backend (facturas + presupuesto).
  const hydrateFinancials = useCallback(async () => {
    try {
      const [invoicesRes, budgetRes] = await Promise.all([
        fetch("/api/finance/invoices"),
        fetch("/api/finance/budget"),
      ]);
      if (invoicesRes.ok) {
        const data = (await invoicesRes.json()) as { items?: FinancialItem[]; demoMode?: boolean };
        setDecisions((data.items ?? []).map(toDecisionRecord));
        setDemoMode(data.demoMode ?? true);
      }
      if (budgetRes.ok) {
        const data = (await budgetRes.json()) as BudgetSummary;
        setBudget(data);
        setDemoMode(data.demoMode);
      }
    } catch {
      // Sin conexión: se conserva la caché visual.
    }
  }, []);

  const processText = useCallback(
    async (rawText: string): Promise<AgentDecision | null> => {
      setLoading(true);
      try {
        let decision: AgentDecision | null = null;

        try {
          const response = await fetch("/api/finance/reserve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawText }),
          });
          if (response.ok) {
            const data = (await response.json()) as {
              ok?: boolean;
              decision?: { estado: AgentDecision["estado"]; regla_disparada: string; razon: string };
              invoiceId?: string;
            };
            if (data.ok && data.decision) {
              decision = {
                invoice_id: data.invoiceId ?? "",
                estado: data.decision.estado,
                regla_disparada: data.decision.regla_disparada,
                razon: data.decision.razon,
                timestamp: new Date().toISOString(),
              } as AgentDecision;
            }
          }
        } catch {
          // Sin conexión: sin decisión financiera confirmada.
        }

        await hydrateFinancials();
        return decision;
      } finally {
        setLoading(false);
      }
    },
    [hydrateFinancials],
  );

  const processFile = useCallback(
    async (file: File): Promise<AgentDecision | null> => {
      setLoading(true);
      try {
        let decision: AgentDecision | null = null;

        try {
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetch("/api/finance/reserve", {
            method: "POST",
            body: formData,
          });
          if (response.ok) {
            const data = (await response.json()) as {
              ok?: boolean;
              decision?: { estado: AgentDecision["estado"]; regla_disparada: string; razon: string };
              invoiceId?: string;
            };
            if (data.ok && data.decision) {
              decision = {
                invoice_id: data.invoiceId ?? "",
                estado: data.decision.estado,
                regla_disparada: data.decision.regla_disparada,
                razon: data.decision.razon,
                timestamp: new Date().toISOString(),
              } as AgentDecision;
            }
          }
        } catch {
          // Sin conexión: sin decisión financiera confirmada.
        }

        await hydrateFinancials();
        return decision;
      } finally {
        setLoading(false);
      }
    },
    [hydrateFinancials],
  );

  const processBatch = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/finance/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: sampleRawInvoices.map((s) => s.rawText) }),
      });
      await hydrateFinancials();
    } finally {
      setLoading(false);
    }
  }, [hydrateFinancials]);

  // Aprobación/rechazo humano: SIEMPRE confirmado en el servidor. No se producen
  // efectos financieros en el cliente (se eliminó el bypass local de Prompt 03).
  const submitApproval = useCallback(
    async (
      record: DecisionRecord,
      action: Exclude<HumanAction, null>,
      justification: string,
    ): Promise<ApprovalSubmitResult> => {
      try {
        const response = await fetch("/api/finance/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: record.decision.invoice_id,
            action: action === "APROBADO" ? "APPROVE" : "REJECT",
            justification,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: string;
          error?: string;
          record?: { nextFlowStatus?: "APPROVED_FOR_PAYMENT" | "REJECTED" };
        };

        if (!response.ok || !data.ok) {
          return { ok: false, error: data.error ?? `El servidor denegó la acción (HTTP ${response.status})` };
        }

        const approvedBy = user ? `${user.email} (${user.role})` : "desconocido";

        // Refresca el estado desde el backend (fuente autoritativa).
        await hydrateFinancials();

        return { ok: true, flowStatus: data.record?.nextFlowStatus, approvedBy };
      } catch {
        return { ok: false, error: "No se pudo conectar con el servidor de aprobaciones" };
      }
    },
    [user, hydrateFinancials],
  );

  const erpSync = useCallback(
    async (provider?: string, csv?: string): Promise<ErpSyncResult | null> => {
      try {
        const response = await fetch("/api/erp-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, csv, rules }),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as ErpSyncResult;
        setRules(data.rules);
        return data;
      } catch {
        return null;
      }
    },
    [rules],
  );

  const checkDbHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/db-health");
      if (response.ok) {
        const data = (await response.json()) as DbHealth;
        setDbHealth(data);
      }
    } catch {
      // Sin conexión; se ignora.
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data = (await response.json()) as { user: SessionUser | null };
        setUser(data.user ?? null);
      }
    } catch {
      // Sin conexión; se conserva la sesión previa.
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user: SessionUser };
    setUser(data.user);
    return data.user;
  }, []);

  const loginDemo = useCallback(async (role: UserRole) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user: SessionUser };
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  // Sincroniza la sesión al montar (cookie HttpOnly + fallback demo) y hidrata
  // facturas + presupuesto desde el backend (fuente autoritativa).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data: { user: SessionUser | null }) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {
        // Sin conexión; se conserva la sesión previa.
      });
    const timer = window.setTimeout(() => {
      void hydrateFinancials();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      cancelled = true;
    };
  }, [hydrateFinancials]);

  const exportCsv = useCallback(
    () => exportReconciliationCsv(decisions.map((d) => d.decision)),
    [decisions],
  );

  const exportJson = useCallback(
    () => exportReconciliationJson(decisions.map((d) => d.decision)),
    [decisions],
  );

  const exportSnapshot = useCallback(
    () =>
      JSON.stringify(
        { rules, decisions, processedIds, processedFingerprints, processedFileHashes },
        null,
        2,
      ),
    [rules, decisions, processedIds, processedFingerprints, processedFileHashes],
  );

  const importSnapshot = useCallback((data: SnapshotData) => {
    if (data.rules) setRules(data.rules);
    if (Array.isArray(data.decisions)) setDecisions(data.decisions);
    if (Array.isArray(data.processedIds)) setProcessedIds(data.processedIds);
    if (Array.isArray(data.processedFingerprints)) {
      setProcessedFingerprints(data.processedFingerprints);
    }
    if (Array.isArray(data.processedFileHashes)) {
      setProcessedFileHashes(data.processedFileHashes);
    }
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      rules,
      decisions,
      processedIds,
      processedFingerprints,
      processedFileHashes,
      loading,
      dbHealth,
      budget,
      demoMode,
      updateRules,
      resetRules,
      processText,
      processFile,
      processBatch,
      submitApproval,
      hydrateFinancials,
      clearDecisions,
      erpSync,
      checkDbHealth,
      exportCsv,
      exportJson,
      exportSnapshot,
      importSnapshot,
      user,
      refreshSession,
      login,
      loginDemo,
      logout,
    }),
    [
      rules,
      decisions,
      processedIds,
      processedFingerprints,
      processedFileHashes,
      loading,
      dbHealth,
      budget,
      demoMode,
      updateRules,
      resetRules,
      processText,
      processFile,
      processBatch,
      submitApproval,
      hydrateFinancials,
      clearDecisions,
      erpSync,
      checkDbHealth,
      exportCsv,
      exportJson,
      exportSnapshot,
      importSnapshot,
      user,
      refreshSession,
      login,
      loginDemo,
      logout,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore debe usarse dentro de un StoreProvider");
  }
  return context;
}
