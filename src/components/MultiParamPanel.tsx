"use client";

import { useStore } from "@/lib/store";
import { getJurisdictionRules, listJurisdictions } from "@/lib/jurisdictions";

/**
 * Panel visual de multiparametrización: jurisdicción fiscal, umbrales y
 * modalidades. Está conectado al store compartido (`useStore`), de modo que
 * cualquier cambio se refleja en las validaciones del motor determinista.
 */

const MODALITIES = ["Startup", "Scaleup", "Corporativo"] as const;

export function MultiParamPanel() {
  const { rules, updateRules } = useStore();
  const jurisdiction = getJurisdictionRules(rules.pais);

  const applyModality = (modality: (typeof MODALITIES)[number]) => {
    if (modality === "Startup") {
      updateRules({ limite_monto_automatico: 500, presupuesto_mensual_restante: 2000 });
    } else if (modality === "Scaleup") {
      updateRules({ limite_monto_automatico: 1000, presupuesto_mensual_restante: 5000 });
    } else {
      updateRules({ limite_monto_automatico: 5000, presupuesto_mensual_restante: 50000 });
    }
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/65 p-6 backdrop-blur-xl">
      <h3 className="text-sm font-medium text-zinc-100">Multiparametrización en segundos</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Jurisdicción, modalidad y umbrales ajustables sin fricción.
      </p>

      <div className="mt-5 space-y-5">
        {/* Jurisdicción */}
        <div>
          <label className="mb-1.5 block text-xs text-zinc-400">Jurisdicción fiscal</label>
          <select
            value={rules.pais ?? ""}
            onChange={(e) => updateRules({ pais: e.target.value || undefined })}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
          >
            <option value="">Sin jurisdicción específica</option>
            {listJurisdictions().map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre} ({j.id})
              </option>
            ))}
          </select>
          {jurisdiction && (
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
              {jurisdiction.identificacion_fiscal} ·{" "}
              {jurisdiction.factura_electronica_obligatoria
                ? "factura electrónica obligatoria"
                : "sin exigencia de factura electrónica"}{" "}
              · {jurisdiction.normativas.join(" · ")}
            </p>
          )}
        </div>

        {/* Modalidad */}
        <div>
          <label className="mb-1.5 block text-xs text-zinc-400">Modalidad de cliente</label>
          <div className="grid grid-cols-3 gap-2">
            {MODALITIES.map((m) => {
              const active =
                (m === "Startup" && rules.limite_monto_automatico === 500) ||
                (m === "Scaleup" && rules.limite_monto_automatico === 1000) ||
                (m === "Corporativo" && rules.limite_monto_automatico === 5000);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => applyModality(m)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                    active
                      ? "border-zinc-500 bg-zinc-900 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* Umbral de riesgo */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs text-zinc-400">Umbral de aprobación automática</label>
            <span className="font-mono text-xs text-zinc-100">
              ${rules.limite_monto_automatico.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={rules.limite_monto_automatico}
            onChange={(e) =>
              updateRules({ limite_monto_automatico: Number(e.target.value) })
            }
            className="w-full accent-emerald-400"
          />
        </div>
      </div>
    </div>
  );
}
