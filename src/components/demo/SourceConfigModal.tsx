"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import type { SourceConfigs } from "@/lib/source-configs";

export type ConfigSourceId = "odoo" | "a2" | "quickbooks" | "correo" | "whatsapp";

interface SourceConfigModalProps {
  source: ConfigSourceId;
  configs: SourceConfigs;
  onChange: <K extends keyof SourceConfigs>(key: K, patch: Partial<SourceConfigs[K]>) => void;
  onClose: () => void;
}

const TITLES: Record<ConfigSourceId, string> = {
  odoo: "Odoo",
  a2: "a2 ERP",
  quickbooks: "QuickBooks",
  correo: "Correo (IMAP / Google / Microsoft)",
  whatsapp: "WhatsApp Business",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-[10px] text-zinc-600">{hint}</span>}
    </label>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function SourceConfigModal({ source, configs, onChange, onClose }: SourceConfigModalProps) {
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [source, onClose]);

  const testConnection = async () => {
    setTesting(true);
    setTested(false);
    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      setTested(true);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-fade-slide max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/[0.08] bg-zinc-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-medium text-zinc-100">{TITLES[source]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {source === "odoo" && (
          <Section>
            <Field
              label="URL de la instancia"
              value={configs.odoo.url}
              onChange={(v) => onChange("odoo", { url: v })}
              placeholder="https://tu-empresa.odoo.com"
            />
            <Field
              label="Versión de Odoo"
              value={configs.odoo.version}
              onChange={(v) => onChange("odoo", { version: v })}
              placeholder="17"
            />
            <Field
              label="Base de datos (DB)"
              value={configs.odoo.database}
              onChange={(v) => onChange("odoo", { database: v })}
              placeholder="nombre_db"
            />
            <Field
              label="Usuario API"
              value={configs.odoo.user}
              onChange={(v) => onChange("odoo", { user: v })}
              placeholder="ap@empresa.com"
            />
            <Field
              label="Token / API Key"
              type="password"
              value={configs.odoo.apiKey}
              onChange={(v) => onChange("odoo", { apiKey: v })}
              placeholder="••••••••"
            />
          </Section>
        )}

        {source === "a2" && (
          <Section>
            <Field
              label="Ruta del servidor (local/remoto)"
              value={configs.a2.serverPath}
              onChange={(v) => onChange("a2", { serverPath: v })}
              placeholder="\\\\servidor\\a2 o https://…"
            />
            <Field
              label="Nombre de la empresa / Base de datos"
              value={configs.a2.company}
              onChange={(v) => onChange("a2", { company: v })}
              placeholder="EmpresaDemo"
            />
            <Field
              label="Tamaño de lote de facturación"
              value={String(configs.a2.batchSize)}
              onChange={(v) => onChange("a2", { batchSize: Number(v) || 100 })}
              placeholder="100"
              hint="Número de facturas por ciclo de sincronización."
            />
          </Section>
        )}

        {source === "quickbooks" && (
          <Section>
            <Field
              label="Cuenta contable predeterminada"
              value={configs.quickbooks.accountingAccount}
              onChange={(v) => onChange("quickbooks", { accountingAccount: v })}
              placeholder="Cuentas por pagar"
            />
            <Field
              label="Tasa de impuestos"
              value={configs.quickbooks.taxRate}
              onChange={(v) => onChange("quickbooks", { taxRate: v })}
              placeholder="0.19"
            />
            <label className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <span className="text-xs text-zinc-400">Conexión OAuth</span>
              <input
                type="checkbox"
                checked={configs.quickbooks.oauthEnabled}
                onChange={(e) => onChange("quickbooks", { oauthEnabled: e.target.checked })}
                className="accent-zinc-300"
              />
            </label>
            <Field
              label="Mapeo CSV de transacciones"
              value={configs.quickbooks.csvMapping}
              onChange={(v) => onChange("quickbooks", { csvMapping: v })}
              placeholder="columna_monto=Amount; columna_proveedor=Vendor"
              hint="Mapeo separado por ; en formato campo=columna."
            />
          </Section>
        )}

        {source === "correo" && (
          <Section>
            <Field
              label="Servidor IMAP"
              value={configs.correo.imapHost}
              onChange={(v) => onChange("correo", { imapHost: v })}
              placeholder="imap.gmail.com"
            />
            <Field
              label="Puerto IMAP"
              value={configs.correo.imapPort}
              onChange={(v) => onChange("correo", { imapPort: v })}
              placeholder="993"
            />
            <Field
              label="Servidor SMTP"
              value={configs.correo.smtpHost}
              onChange={(v) => onChange("correo", { smtpHost: v })}
              placeholder="smtp.gmail.com"
            />
            <Field
              label="Correo corporativo autorizado"
              value={configs.correo.authorizedEmail}
              onChange={(v) => onChange("correo", { authorizedEmail: v })}
              placeholder="ap@empresa.com"
            />
            <Field
              label="Credenciales / Token de acceso"
              type="password"
              value={configs.correo.token}
              onChange={(v) => onChange("correo", { token: v })}
              placeholder="token o app password"
            />
          </Section>
        )}

        {source === "whatsapp" && (
          <Section>
            <Field
              label="Número de teléfono autorizado"
              value={configs.whatsapp.phone}
              onChange={(v) => onChange("whatsapp", { phone: v })}
              placeholder="+15551234567"
            />
            <Field
              label="Token de la API (Meta / WhatsApp Business)"
              type="password"
              value={configs.whatsapp.apiToken}
              onChange={(v) => onChange("whatsapp", { apiToken: v })}
              placeholder="••••••••"
            />
            <Field
              label="Webhook de recepción"
              value={configs.whatsapp.webhook}
              onChange={(v) => onChange("whatsapp", { webhook: v })}
              placeholder="https://tu-dominio.com/api/wa"
            />
          </Section>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Guardar
          </button>
        </div>

        {tested && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conexión validada (demo). Configuración guardada.
          </p>
        )}
      </div>
    </div>
  );
}
