"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Configuración de orígenes de ingesta (Odoo, a2 ERP, QuickBooks, Correo,
 * WhatsApp). Es configuración de conexión, separada de las reglas financieras
 * (`CompanyRules`): el motor determinista no decide sobre estas credenciales.
 *
 * Se persiste en localStorage (demo) para que el motor de ingesta del demo
 * sepa cómo interpretar el canal seleccionado durante el recorrido.
 */

export interface OdooConfig {
  url: string;
  version: string;
  database: string;
  user: string;
  apiKey: string;
}

export interface A2Config {
  serverPath: string;
  company: string;
  batchSize: number;
}

export interface QuickbooksConfig {
  accountingAccount: string;
  taxRate: string;
  oauthEnabled: boolean;
  csvMapping: string;
}

export interface EmailConfig {
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  authorizedEmail: string;
  token: string;
}

export interface WhatsAppConfig {
  phone: string;
  apiToken: string;
  webhook: string;
}

export interface SourceConfigs {
  odoo: OdooConfig;
  a2: A2Config;
  quickbooks: QuickbooksConfig;
  correo: EmailConfig;
  whatsapp: WhatsAppConfig;
}

const STORAGE_KEY = "jippay_source_configs";

export const DEFAULT_SOURCE_CONFIGS: SourceConfigs = {
  odoo: {
    url: "",
    version: "17",
    database: "",
    user: "",
    apiKey: "",
  },
  a2: {
    serverPath: "",
    company: "",
    batchSize: 100,
  },
  quickbooks: {
    accountingAccount: "",
    taxRate: "",
    oauthEnabled: false,
    csvMapping: "",
  },
  correo: {
    imapHost: "",
    imapPort: "993",
    smtpHost: "",
    authorizedEmail: "",
    token: "",
  },
  whatsapp: {
    phone: "",
    apiToken: "",
    webhook: "",
  },
};

function load(): SourceConfigs {
  if (typeof window === "undefined") return DEFAULT_SOURCE_CONFIGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOURCE_CONFIGS;
    const parsed = JSON.parse(raw) as Partial<SourceConfigs>;
    return {
      odoo: { ...DEFAULT_SOURCE_CONFIGS.odoo, ...(parsed.odoo ?? {}) },
      a2: { ...DEFAULT_SOURCE_CONFIGS.a2, ...(parsed.a2 ?? {}) },
      quickbooks: { ...DEFAULT_SOURCE_CONFIGS.quickbooks, ...(parsed.quickbooks ?? {}) },
      correo: { ...DEFAULT_SOURCE_CONFIGS.correo, ...(parsed.correo ?? {}) },
      whatsapp: { ...DEFAULT_SOURCE_CONFIGS.whatsapp, ...(parsed.whatsapp ?? {}) },
    };
  } catch {
    return DEFAULT_SOURCE_CONFIGS;
  }
}

/** Hook de estado persistente para la configuración de orígenes. */
export function useSourceConfigs() {
  const [configs, setConfigs] = useState<SourceConfigs>(load);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    }
  }, [configs]);

  const updateConfig = useCallback(
    <K extends keyof SourceConfigs>(key: K, patch: Partial<SourceConfigs[K]>) => {
      setConfigs((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    },
    [],
  );

  const resetConfig = useCallback((key: keyof SourceConfigs) => {
    setConfigs((prev) => ({ ...prev, [key]: { ...DEFAULT_SOURCE_CONFIGS[key] } }));
  }, []);

  return { configs, updateConfig, resetConfig };
}
