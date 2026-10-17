import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones — Jippay",
  description:
    "Términos y condiciones del servicio Jippay: validador y emisor de decisiones contables.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-10">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Legal
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
          Términos y Condiciones
        </h1>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          Última actualización: 2026-10-17
        </p>
      </div>

      <div className="space-y-8 text-sm leading-7 text-zinc-300">
        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">1. Naturaleza del servicio</h2>
          <p>
            Jippay es una plataforma de <strong>validación y emisión de decisiones contables</strong>{" "}
            para cuentas por pagar. Jippay analiza documentos, aplica reglas de negocio
            deterministas y emite veredictos explicables (aprobar, escalar o frenar).{" "}
            <strong>Jippay no es una pasarela de pago ni una entidad financiera</strong>: no
            ejecuta transferencias, no custodia fondos ni liquida pagos. Cualquier movimiento
            de dinero se realiza a través de las entidades financieras que el cliente haya
            contratado por separado.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">2. Separación de funciones</h2>
          <p>
            La inteligencia artificial únicamente extrae, interpreta y estructura información
            documental. Las decisiones financieras son producidas por un motor determinista de
            reglas, auditables y reproducibles. La IA no puede autorizar pagos, modificar
            presupuestos ni eludir controles.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">3. Uso del servicio</h2>
          <p>
            El cliente se compromete a utilizar Jippay conforme a la normativa aplicable y a las
            políticas internas de su organización. Las excepciones que requieran aprobación humana
            deben ser resueltas por usuarios autenticados y autorizados, con justificación
            documentada. Jippay no sustituye el criterio profesional ni la revisión contable final.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">4. Datos y trazabilidad</h2>
          <p>
            Jippay mantiene un registro de auditoría de las decisiones y de sus fundamentos. El
            cliente es responsable de la exactitud de la información suministrada y de conservar
            la documentación original de soporte que exija la normativa aplicable.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">5. Sin garantía de resultado financiero</h2>
          <p>
            Jippay se ofrece «tal cual» y no garantiza la ausencia de errores ni que sus
            recomendaciones eviten todas las pérdidas. Las decisiones finales de pago son
            responsabilidad exclusiva del cliente y de sus representantes autorizados.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">6. Propiedad intelectual</h2>
          <p>
            El software, los algoritmos, la interfaz y la documentación de Jippay son propiedad de
            sus titulares. El cliente recibe una licencia limitada, revocable y no exclusiva para
            usar el servicio durante la vigencia de su relación comercial.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">7. Modificaciones</h2>
          <p>
            Jippay puede actualizar estos términos de forma razonable. Los cambios se comunicarán
            a través de la plataforma. El uso continuado del servicio tras una modificación
            constituye aceptación de los nuevos términos.
          </p>
        </section>
      </div>
    </div>
  );
}
