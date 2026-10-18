"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  Download,
  HardDrive,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import { IOSGlassCard } from "@/components/ui/IOSGlassCard";
import { IOSMetricRing } from "@/components/ui/IOSMetricRing";
import {
  IOSSegmentedControl,
  type SegmentedOption,
} from "@/components/ui/IOSSegmentedControl";
import { DashboardShell } from "@/components/ui/DashboardShell";
import { getJurisdictionRules, listJurisdictions } from "@/lib/jurisdictions";
import { useStore, type SnapshotData } from "@/lib/store";

type AdminTab = "reglas" | "erp" | "db";

const TABS: SegmentedOption<AdminTab>[] = [
  { value: "reglas", label: "Reglas" },
  { value: "erp", label: "ERP / CSV" },
  { value: "db", label: "Multi-DB" },
];

const PROFILES: { name: string; limite: number; presupuesto: number }[] = [
  { name: "Modo Estricto Startup", limite: 500, presupuesto: 2000 },
  { name: "Modo Balanceado Scaleup", limite: 1000, presupuesto: 5000 },
  { name: "Modo Corporativo", limite: 5000, presupuesto: 50000 },
];

/**
 * Configuración operativa avanzada (centros de costo, equipo y cumplimiento).
 * Es configuración corporativa de UI; no forma parte de las reglas financieras
 * deterministas del motor (que siguen siendo `CompanyRules`).
 */
interface AdvancedConfig {
  costCenters: string[];
  sharedAnalysts: number;
  alertThreshold: number;
  compliance: {
    sox: boolean;
    iso20022: boolean;
    threeWayMatch: boolean;
    antiFraud: boolean;
  };
}

const DEFAULT_ADVANCED: AdvancedConfig = {
  costCenters: ["Operaciones", "Tecnología", "Marketing"],
  sharedAnalysts: 3,
  alertThreshold: 1000,
  compliance: {
    sox: true,
    iso20022: true,
    threeWayMatch: true,
    antiFraud: true,
  },
};

const ADVANCED_KEY = "jippay_advanced_config";

function loadAdvanced(): AdvancedConfig {
  if (typeof window === "undefined") return DEFAULT_ADVANCED;
  try {
    const raw = window.localStorage.getItem(ADVANCED_KEY);
    if (!raw) return DEFAULT_ADVANCED;
    const parsed = JSON.parse(raw) as Partial<AdvancedConfig>;
    return {
      ...DEFAULT_ADVANCED,
      ...parsed,
      compliance: { ...DEFAULT_ADVANCED.compliance, ...(parsed.compliance ?? {}) },
    };
  } catch {
    return DEFAULT_ADVANCED;
  }
}

export default function AdminPage() {
  const {
    rules,
    decisions,
    user,
    updateRules,
    resetRules,
    erpSync,
    checkDbHealth,
    dbHealth,
    exportSnapshot,
    importSnapshot,
  } = useStore();
  const [tab, setTab] = useState<AdminTab>("reglas");
  const [newProvider, setNewProvider] = useState("");
  const [agreementProvider, setAgreementProvider] = useState("");
  const [agreementAmount, setAgreementAmount] = useState("");
  const [notify, setNotify] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedConfig>(loadAdvanced);
  const [newCostCenter, setNewCostCenter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADVANCED_KEY, JSON.stringify(advanced));
    }
  }, [advanced]);

  const addCostCenter = () => {
    if (!isCfo) return;
    const name = newCostCenter.trim();
    if (!name) return;
    if (advanced.costCenters.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setNewCostCenter("");
      return;
    }
    setAdvanced((prev) => ({ ...prev, costCenters: [...prev.costCenters, name] }));
    setNewCostCenter("");
  };

  const removeCostCenter = (name: string) => {
    if (!isCfo) return;
    setAdvanced((prev) => ({
      ...prev,
      costCenters: prev.costCenters.filter((c) => c !== name),
    }));
  };

  const acuerdos = rules.acuerdos_por_proveedor ?? {};
  const jurisdiction = getJurisdictionRules(rules.pais);
  const isCfo = user?.role === "CFO_ADMIN";

  const totalDecisions = decisions.length;
  const pagarCount = decisions.filter((d) => d.decision.estado === "PAGAR").length;
  const escalarCount = decisions.filter((d) => d.decision.estado === "ESCALAR").length;
  const frenarCount = decisions.filter((d) => d.decision.estado === "FRENAR").length;
  const autonomia = totalDecisions > 0 ? Math.round((pagarCount / totalDecisions) * 100) : 0;

  const flash = (message: string) => {
    setNotify(message);
    window.setTimeout(() => setNotify(null), 4000);
  };

  const addProvider = () => {
    if (!isCfo) return;
    const name = newProvider.trim();
    if (!name) return;
    if (rules.proveedores_permitidos.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNewProvider("");
      return;
    }
    updateRules({ proveedores_permitidos: [...rules.proveedores_permitidos, name] });
    setNewProvider("");
  };

  const removeProvider = (name: string) => {
    if (!isCfo) return;
    updateRules({ proveedores_permitidos: rules.proveedores_permitidos.filter((p) => p !== name) });
  };

  const upsertAgreement = () => {
    if (!isCfo) return;
    const provider = agreementProvider.trim();
    const amount = Number(agreementAmount);
    if (!provider || !Number.isFinite(amount) || amount < 0) return;
    updateRules({ acuerdos_por_proveedor: { ...acuerdos, [provider]: amount } });
    setAgreementProvider("");
    setAgreementAmount("");
  };

  const removeAgreement = (provider: string) => {
    if (!isCfo) return;
    const next = { ...acuerdos };
    delete next[provider];
    updateRules({ acuerdos_por_proveedor: next });
  };

  const syncErp = async (provider?: string) => {
    if (!isCfo) return;
    const result = await erpSync(provider);
    if (result) {
      flash(
        `Sincronización completada: ${result.updatedProviders} proveedores y ${result.updatedAgreements} acuerdos actualizados.`,
      );
    } else {
      flash("No se pudo sincronizar con el ERP.");
    }
  };

  const importCsvFile = async (file: File) => {
    if (!isCfo) return;
    const text = await file.text();
    const result = await erpSync(undefined, text);
    if (result) {
      flash(
        `Importación CSV: ${result.updatedProviders} proveedores y ${result.updatedAgreements} acuerdos actualizados.`,
      );
    } else {
      flash("No se pudo importar el archivo CSV.");
    }
  };

  const downloadSnapshot = () => {
    const blob = new Blob([exportSnapshot()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jippay-snapshot.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const restoreSnapshot = async (file: File) => {
    if (!isCfo) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as SnapshotData;
      if (data.rules || Array.isArray(data.decisions) || Array.isArray(data.processedIds)) {
        importSnapshot(data);
        flash("Snapshot restaurado correctamente.");
      } else {
        flash("El archivo no contiene un snapshot válido.");
      }
    } catch {
      flash("No se pudo restaurar el snapshot (JSON inválido).");
    }
  };

  return (
    <DashboardShell activePath="/admin">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Vista 02 · Centro de Control
        </span>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-100">Reglas, ERP & Multi-DB</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Define las fronteras del agente y conecta tu infraestructura financiera.
        </p>
      </div>

      <div className="mb-6">
        <IOSSegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {notify && (
        <div className="mb-6 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
          {notify}
        </div>
      )}

      {user && !isCfo && (
        <div className="mb-6 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
          <span className="font-medium">Protección SOX:</span> tu rol actual ({user.role}) tiene
          permisos de {user.role === "AUDITOR_VIEWER" ? "solo lectura" : "aprobación"}.
          La edición de reglas maestras está deshabilitada.
        </div>
      )}

      {/* TAB: REGLAS */}
      {tab === "reglas" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IOSGlassCard className="p-6 lg:col-span-2">
            <h2 className="text-lg font-medium text-zinc-100">Jurisdicción Fiscal</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Selecciona el país para aplicar su legislación local en las validaciones.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                disabled={!isCfo}
                value={rules.pais ?? ""}
                onChange={(e) => updateRules({ pais: e.target.value || undefined })}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">Sin jurisdicción específica</option>
                {listJurisdictions().map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nombre} ({j.id})
                  </option>
                ))}
              </select>
              {jurisdiction && (
                <span className="font-mono text-xs text-zinc-500">
                  {jurisdiction.identificacion_fiscal} ·{" "}
                  {jurisdiction.factura_electronica_obligatoria
                    ? "factura electrónica obligatoria"
                    : "sin exigencia de factura electrónica"}
                </span>
              )}
            </div>
            {jurisdiction && (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Normativas aplicables: {jurisdiction.normativas.join(" · ")}
                {jurisdiction.retencion_umbral_usd != null
                  ? ` · retención desde $${jurisdiction.retencion_umbral_usd}`
                  : ""}
              </p>
            )}
          </IOSGlassCard>

          <IOSGlassCard className="p-6">
            <h2 className="text-lg font-medium text-zinc-100">Límite de Aprobación Automática</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Por encima de este monto, la factura se escala a un humano.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <input
                type="number"
                min={0}
                disabled={!isCfo}
                value={rules.limite_monto_automatico}
                onChange={(e) =>
                  updateRules({ limite_monto_automatico: Math.max(0, Number(e.target.value)) })
                }
                className="w-32 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-sm text-zinc-500">USD</span>
            </div>
            <input
              type="range"
              min={0}
              max={10000}
              step={50}
              disabled={!isCfo}
              value={rules.limite_monto_automatico}
              onChange={(e) => updateRules({ limite_monto_automatico: Number(e.target.value) })}
              className="mt-4 w-full accent-zinc-300 disabled:opacity-50"
            />
          </IOSGlassCard>

          <IOSGlassCard className="p-6">
            <h2 className="text-lg font-medium text-zinc-100">Presupuesto Mensual Restante</h2>
            <p className="mt-1 text-xs text-zinc-500">Saldo disponible para el periodo en curso.</p>
            <div className="mt-4 flex items-center gap-4">
              <input
                type="number"
                min={0}
                disabled={!isCfo}
                value={rules.presupuesto_mensual_restante}
                onChange={(e) =>
                  updateRules({ presupuesto_mensual_restante: Math.max(0, Number(e.target.value)) })
                }
                className="w-32 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-sm text-zinc-500">USD</span>
            </div>
            <input
              type="range"
              min={0}
              max={50000}
              step={100}
              disabled={!isCfo}
              value={rules.presupuesto_mensual_restante}
              onChange={(e) =>
                updateRules({ presupuesto_mensual_restante: Number(e.target.value) })
              }
              className="mt-4 w-full accent-zinc-300 disabled:opacity-50"
            />
          </IOSGlassCard>

          <IOSGlassCard className="p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-zinc-100">Perfiles Rápidos</h2>
              <span className="font-mono text-xs text-zinc-500">Modo de operación</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PROFILES.map((profile) => (
                <button
                  key={profile.name}
                  type="button"
                  disabled={!isCfo}
                  onClick={() =>
                    updateRules({
                      limite_monto_automatico: profile.limite,
                      presupuesto_mensual_restante: profile.presupuesto,
                    })
                  }
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-left transition-colors hover:border-zinc-600 disabled:opacity-50"
                >
                  <Zap className="h-4 w-4 text-zinc-500" />
                  <span className="mt-2 block text-sm font-medium text-zinc-200">{profile.name}</span>
                  <span className="mt-1 block font-mono text-xs text-zinc-500">
                    límite ${profile.limite} · presupuesto ${profile.presupuesto}
                  </span>
                </button>
              ))}
            </div>
          </IOSGlassCard>

          <IOSGlassCard className="p-6 lg:col-span-2">
            <h2 className="mb-4 text-lg font-medium text-zinc-100">Consumo del Presupuesto</h2>
            <div className="flex flex-wrap items-center justify-center gap-10">
              <IOSMetricRing
                label="Presupuesto restante"
                value={rules.presupuesto_mensual_restante}
                max={5000}
                display={`$${rules.presupuesto_mensual_restante.toLocaleString()}`}
              />
              <IOSMetricRing
                label="Autonomía (PAGAR)"
                value={autonomia}
                max={100}
                display={`${autonomia}%`}
              />
              <IOSMetricRing
                label="FRENADAS"
                value={frenarCount}
                max={Math.max(totalDecisions, 1)}
                display={String(frenarCount)}
              />
              <IOSMetricRing
                label="ESCALADAS"
                value={escalarCount}
                max={Math.max(totalDecisions, 1)}
                display={String(escalarCount)}
              />
            </div>
            <p className="mt-4 text-center font-mono text-xs text-zinc-500">
              {totalDecisions} decisiones · {pagarCount} PAGAR · {escalarCount} ESCALAR ·{" "}
              {frenarCount} FRENAR
            </p>
          </IOSGlassCard>

          <IOSGlassCard className="p-6 lg:col-span-2">
            <h2 className="text-lg font-medium text-zinc-100">Opciones Avanzadas</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Configuración operativa corporativa (equipo, centros de costo y cumplimiento).
            </p>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Centros de costo */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-zinc-400" />
                  <label className="text-sm text-zinc-400">Centros de costo</label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCostCenter}
                    disabled={!isCfo}
                    onChange={(e) => setNewCostCenter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCostCenter();
                    }}
                    placeholder="Añadir centro…"
                    className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={addCostCenter}
                    disabled={!isCfo}
                    className="inline-flex items-center gap-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {advanced.costCenters.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-200"
                    >
                      {c}
                      <button
                        onClick={() => removeCostCenter(c)}
                        disabled={!isCfo}
                        className="text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                        aria-label={`Eliminar ${c}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Analistas compartidos */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-zinc-400" />
                  <label className="text-sm text-zinc-400">Analistas compartidos</label>
                </div>
                <input
                  type="number"
                  min={1}
                  max={50}
                  disabled={!isCfo}
                  value={advanced.sharedAnalysts}
                  onChange={(e) =>
                    setAdvanced((prev) => ({
                      ...prev,
                      sharedAnalysts: Math.max(1, Math.min(50, Number(e.target.value))),
                    }))
                  }
                  className="w-32 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-zinc-600">
                  Capacidad concurrente del equipo de auditoría.
                </p>
              </div>

              {/* Umbral de alerta */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Bell className="h-4 w-4 text-zinc-400" />
                  <label className="text-sm text-zinc-400">Umbral de alerta</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    disabled={!isCfo}
                    value={advanced.alertThreshold}
                    onChange={(e) =>
                      setAdvanced((prev) => ({
                        ...prev,
                        alertThreshold: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="w-32 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
                  />
                  <span className="text-sm text-zinc-500">USD</span>
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  Monto desde el que se notifica a los supervisores.
                </p>
              </div>

              {/* Reglas de cumplimiento */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-zinc-400" />
                  <label className="text-sm text-zinc-400">Reglas de cumplimiento</label>
                </div>
                <div className="space-y-2">
                  {(
                    [
                      ["sox", "SOX — segregación de funciones"],
                      ["iso20022", "ISO 20022 — mensajería financiera"],
                      ["threeWayMatch", "3-Way Match — PO / recibo / factura"],
                      ["antiFraud", "Anti-fraude — prompt injection y spoofing"],
                    ] as const
                  ).map(([key, label]) => {
                    const checked = advanced.compliance[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!isCfo}
                        onClick={() =>
                          setAdvanced((prev) => ({
                            ...prev,
                            compliance: { ...prev.compliance, [key]: !checked },
                          }))
                        }
                        className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-zinc-600 disabled:opacity-50"
                      >
                        <span>{label}</span>
                        <span
                          className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                            checked ? "bg-zinc-200" : "bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-zinc-950 transition-transform ${
                              checked ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </IOSGlassCard>
        </div>
      )}

      {/* TAB: ERP/CSV */}
      {tab === "erp" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IOSGlassCard className="p-6">
            <h2 className="text-lg font-medium text-zinc-100">Lista Blanca de Proveedores</h2>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newProvider}
                disabled={!isCfo}
                onChange={(e) => setNewProvider(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addProvider();
                }}
                placeholder="Nombre del proveedor"
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={addProvider}
                disabled={!isCfo}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Añadir
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {rules.proveedores_permitidos.map((provider) => (
                <span
                  key={provider}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-200"
                >
                  {provider}
                  <button
                    onClick={() => removeProvider(provider)}
                    disabled={!isCfo}
                    className="text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-40"
                    aria-label={`Eliminar ${provider}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-medium text-zinc-200">Acuerdos Comerciales</h3>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={agreementProvider}
                disabled={!isCfo}
                onChange={(e) => setAgreementProvider(e.target.value)}
                placeholder="Proveedor"
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <input
                type="number"
                min={0}
                value={agreementAmount}
                disabled={!isCfo}
                onChange={(e) => setAgreementAmount(e.target.value)}
                placeholder="Monto"
                className="w-28 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={upsertAgreement}
                disabled={!isCfo}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Proveedor</th>
                    <th className="px-3 py-2 font-medium">Acuerdo</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {Object.entries(acuerdos).map(([provider, amount]) => (
                    <tr key={provider}>
                      <td className="px-3 py-2 text-zinc-200">{provider}</td>
                      <td className="px-3 py-2 font-mono text-zinc-400">${amount}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeAgreement(provider)}
                          disabled={!isCfo}
                          className="text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-40"
                          aria-label={`Eliminar acuerdo de ${provider}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </IOSGlassCard>

          <IOSGlassCard className="p-6">
            <h2 className="text-lg font-medium text-zinc-100">Sincronización ERP / CSV</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Importa maestros de proveedores desde ERP o sube un CSV.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["odoo", "sap", "quickbooks", "netsuite", "a2", "excel"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!isCfo}
                  onClick={() => syncErp(p)}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-50"
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!isCfo}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Importar CSV
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importCsvFile(file);
                e.target.value = "";
              }}
            />
          </IOSGlassCard>
        </div>
      )}

      {/* TAB: MULTI-DB */}
      {tab === "db" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[
            { name: "Local File-DB", icon: HardDrive, note: ".data/jippay-ledger.json" },
            { name: "PostgreSQL / Supabase", icon: Server, note: "env: SUPABASE_URL" },
            { name: "Edge Memory", icon: Activity, note: "localStorage sync" },
          ].map((item) => {
            const adapter = dbHealth?.adaptadores?.find((a) =>
              a.adapter.toLowerCase().includes(item.name.split(" ")[0].toLowerCase()),
            );
            return (
              <IOSGlassCard key={item.name} className="p-6">
                <div className="flex items-center justify-between">
                  <item.icon className="h-5 w-5 text-zinc-400" />
                  <span
                    className={`h-2 w-2 rounded-full ${
                      adapter?.ok ? "bg-zinc-300" : "bg-zinc-700"
                    }`}
                  />
                </div>
                <h3 className="mt-3 font-medium text-zinc-100">{item.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">{item.note}</p>
                <div className="mt-4 font-mono text-xs text-zinc-400">
                  {adapter ? (
                    <>
                      <span>latencia: </span>
                      <span className="text-zinc-200">{adapter.latencyMs} ms</span>
                      <span className="block text-zinc-600">{adapter.mode}</span>
                    </>
                  ) : (
                    <span className="text-zinc-600">Sin diagnosticar</span>
                  )}
                </div>
              </IOSGlassCard>
            );
          })}

          <div className="flex flex-col gap-3 lg:col-span-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void checkDbHealth()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              <Activity className="h-4 w-4" />
              Probar Conexiones DB
            </button>
            <button
              type="button"
              onClick={downloadSnapshot}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              <Download className="h-4 w-4" />
              Descargar Snapshot JSON
            </button>
            <button
              type="button"
              disabled={!isCfo}
              onClick={() => snapshotInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Restaurar Snapshot
            </button>
            <input
              ref={snapshotInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void restoreSnapshot(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button
          onClick={resetRules}
          disabled={!isCfo}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          Resetear Demo
        </button>
      </div>
      </div>
    </DashboardShell>
  );
}
