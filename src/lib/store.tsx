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
import { evaluateInvoice } from "./engine";
import {
  exportReconciliationCsv,
  exportReconciliationJson,
} from "./erp/erp-connector";
import { extractInvoiceFromText } from "./extractor";
import { ingestFile } from "./multimodal-ingestor";
import { defaultCompanyRules, sampleRawInvoices } from "./mock-data";
import type { AgentDecision, CompanyRules } from "./schemas";
import { compositeFingerprint } from "./security";
import type { SessionUser, UserRole } from "./auth/roles";

export type HumanAction = "APROBADO" | "RECHAZADO" | null;

export interface DecisionRecord {
  decision: AgentDecision;
  rawText: string;
  humanAction: HumanAction;
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
  updateRules: (patch: Partial<CompanyRules>) => void;
  resetRules: () => void;
  processText: (rawText: string) => Promise<AgentDecision | null>;
  processFile: (file: File) => Promise<AgentDecision | null>;
  processBatch: () => Promise<void>;
  resolveEscalated: (
    record: DecisionRecord,
    action: Exclude<HumanAction, null>,
    note?: string,
  ) => void;
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

function applyPaySideEffects(decision: AgentDecision, rules: CompanyRules): CompanyRules {
  if (decision.estado !== "PAGAR") return rules;
  const monto = decision.factura?.monto_usd ?? decision.factura?.monto ?? 0;
  return {
    ...rules,
    presupuesto_mensual_restante: Math.max(0, rules.presupuesto_mensual_restante - monto),
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

  const recordPaid = useCallback((decision: AgentDecision) => {
    if (decision.estado !== "PAGAR") return;
    setProcessedIds((prev) =>
      prev.includes(decision.invoice_id) ? prev : [...prev, decision.invoice_id],
    );
    const factura = decision.factura;
    if (factura) {
      const fingerprint = compositeFingerprint(
        factura.emisor,
        factura.monto_usd ?? factura.monto,
        factura.fecha_vencimiento,
      );
      setProcessedFingerprints((prev) =>
        prev.includes(fingerprint) ? prev : [...prev, fingerprint],
      );
      if (factura.fileHash) {
        setProcessedFileHashes((prev) =>
          prev.includes(factura.fileHash as string) ? prev : [...prev, factura.fileHash as string],
        );
      }
    }
  }, []);

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

  const processText = useCallback(
    async (rawText: string): Promise<AgentDecision | null> => {
      setLoading(true);
      try {
        let decision: AgentDecision | null = null;

        try {
          const response = await fetch("/api/process-invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rawText,
              rules,
              processedIds,
              processedFingerprints,
              processedFileHashes,
            }),
          });
          if (response.ok) {
            const data = (await response.json()) as { decision: AgentDecision };
            decision = data.decision;
          }
        } catch {
          // Cae al procesamiento local.
        }

        if (!decision) {
          const invoice = await extractInvoiceFromText(rawText, rules);
          decision = evaluateInvoice(
            invoice,
            rules,
            processedIds,
            processedFingerprints,
            processedFileHashes,
          );
        }

        setDecisions((prev) => [{ decision: decision as AgentDecision, rawText, humanAction: null }, ...prev]);
        setRules((prev) => applyPaySideEffects(decision as AgentDecision, prev));
        recordPaid(decision as AgentDecision);
        return decision;
      } finally {
        setLoading(false);
      }
    },
    [rules, processedIds, processedFingerprints, processedFileHashes, recordPaid],
  );

  const processFile = useCallback(
    async (file: File): Promise<AgentDecision | null> => {
      setLoading(true);
      try {
        let decision: AgentDecision | null = null;
        let rawText = `Archivo: ${file.name}`;

        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("rules", JSON.stringify(rules));
          formData.append("processedIds", JSON.stringify(processedIds));
          formData.append("processedFingerprints", JSON.stringify(processedFingerprints));
          formData.append("processedFileHashes", JSON.stringify(processedFileHashes));

          const response = await fetch("/api/ingest-file", {
            method: "POST",
            body: formData,
          });
          if (response.ok) {
            const data = (await response.json()) as {
              decision: AgentDecision;
              rawText?: string;
            };
            decision = data.decision;
            rawText = data.rawText ?? rawText;
          }
        } catch {
          // Cae al procesamiento local ante fallo de red.
        }

        if (!decision) {
          const buffer = new Uint8Array(await file.arrayBuffer());
          const ingested = await ingestFile(buffer, file.name);
          rawText = ingested.rawText;
          decision = evaluateInvoice(
            ingested.invoice,
            rules,
            processedIds,
            processedFingerprints,
            processedFileHashes,
          );
        }

        setDecisions((prev) => [{ decision: decision as AgentDecision, rawText, humanAction: null }, ...prev]);
        setRules((prev) => applyPaySideEffects(decision as AgentDecision, prev));
        recordPaid(decision as AgentDecision);
        return decision;
      } finally {
        setLoading(false);
      }
    },
    [rules, processedIds, processedFingerprints, processedFileHashes, recordPaid],
  );

  const processBatch = useCallback(async () => {
    setLoading(true);
    try {
      let currentRules = rules;
      const ids: string[] = [];
      const fingerprints: string[] = [];
      const hashes: string[] = [];
      const newRecords: DecisionRecord[] = [];

      for (const sample of sampleRawInvoices) {
        const invoice = await extractInvoiceFromText(sample.rawText, currentRules);
        const decision = evaluateInvoice(invoice, currentRules, ids, fingerprints, hashes);
        newRecords.push({ decision, rawText: sample.rawText, humanAction: null });

        if (decision.estado === "PAGAR") {
          currentRules = applyPaySideEffects(decision, currentRules);
          if (!ids.includes(decision.invoice_id)) ids.push(decision.invoice_id);
          const fingerprint = compositeFingerprint(
            invoice.emisor,
            invoice.monto_usd ?? invoice.monto,
            invoice.fecha_vencimiento,
          );
          if (!fingerprints.includes(fingerprint)) fingerprints.push(fingerprint);
        }
      }

      setDecisions((prev) => [...newRecords.reverse(), ...prev]);
      setRules(currentRules);
      setProcessedIds(ids);
      setProcessedFingerprints(fingerprints);
      setProcessedFileHashes(hashes);
    } finally {
      setLoading(false);
    }
  }, [rules]);

  const resolveEscalated = useCallback(
    (record: DecisionRecord, action: Exclude<HumanAction, null>, note?: string) => {
      const approvedBy = user ? `${user.email} (${user.role})` : "desconocido";
      setDecisions((prev) =>
        prev.map((item) =>
          item.decision.invoice_id === record.decision.invoice_id &&
          item.decision.estado === "ESCALAR" &&
          item.humanAction === null
            ? {
                ...item,
                humanAction: action,
                decision: {
                  ...item.decision,
                  approved_by: approvedBy,
                  approval_note: note?.trim() || undefined,
                },
              }
            : item,
        ),
      );

      if (action === "APROBADO") {
        setRules((prev) => applyPaySideEffects(record.decision, prev));
        recordPaid(record.decision);
      }
    },
    [recordPaid, user],
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

  // Sincroniza la sesión al montar (cookie HttpOnly + fallback demo).
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
    return () => {
      cancelled = true;
    };
  }, []);

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
      updateRules,
      resetRules,
      processText,
      processFile,
      processBatch,
      resolveEscalated,
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
      updateRules,
      resetRules,
      processText,
      processFile,
      processBatch,
      resolveEscalated,
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
