"use client";

import { useId, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  confirmarImportacion,
  previsualizarImportacion,
  type ResultadoImportacion,
  type ResumenImportacion,
  type VistaPrevia,
} from "@/lib/medicamentos/acciones";

/**
 * Reimportación del catálogo de medicamentos, en dos pasos (RF-13).
 *
 * ## Por qué DOS pasos y no un botón
 *
 * El script de terminal tiene `--dry-run` porque nadie escribe en producción a
 * ciegas; la pantalla no puede ofrecer menos. El paso 1 lee el Sheet y dice
 * exactamente qué pasaría —cuántos nuevos, cuáles cambian de principio activo,
 * qué duplicados hay y dónde— sin tocar la base. El paso 2 escribe.
 *
 * Y el paso 2 no es un clic: hay que marcar la casilla primero. No es
 * ceremonia — el botón vive justo debajo del resumen que acaba de aparecer, o
 * sea justo donde el dedo ya estaba al pedir la vista previa. La casilla es lo
 * que separa "mirar" de "escribir en producción".
 *
 * ## La huella
 *
 * La vista previa devuelve una huella del contenido leído y confirmar la manda
 * de vuelta. El servidor relee el Sheet y compara: si cambió en el medio, no
 * escribe. Sin eso, "confirmar" escribiría algo que nadie llegó a ver — y el
 * Sheet es un documento vivo que la doctora edita desde otra pestaña.
 *
 * ## Estado de carga
 *
 * La llamada a Google Sheets tarda lo suyo (autenticación + lectura), así que
 * las dos operaciones deshabilitan sus botones y muestran el giro. El
 * `aria-live` de abajo lo anuncia también para quien no ve la pantalla.
 */
export function ImportarMedicamentos({ totalInicial }: { totalInicial: number | null }) {
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  /** Qué está corriendo. `null` = nada; es lo que deshabilita los botones. */
  const [operacion, setOperacion] = useState<null | "vista" | "importacion">(null);

  const idConfirmacion = useId();
  const ocupado = operacion !== null;

  async function verQueCambiaria() {
    setOperacion("vista");
    setError(null);
    setResultado(null);
    setConfirmado(false);
    const respuesta = await previsualizarImportacion();
    setOperacion(null);
    if (respuesta.ok) setVista(respuesta);
    else {
      setVista(null);
      setError(respuesta.mensaje);
    }
  }

  async function importarDeVerdad() {
    if (!vista || !confirmado) return;
    setOperacion("importacion");
    setError(null);
    const respuesta = await confirmarImportacion(vista.huella);
    setOperacion(null);
    if (respuesta.ok) {
      setResultado(respuesta);
      setVista(null);
      setConfirmado(false);
    } else {
      setError(respuesta.mensaje);
      // Si el Sheet cambió, la vista previa que hay en pantalla ya es mentira.
      if (respuesta.huellaCambiada) {
        setVista(null);
        setConfirmado(false);
      }
    }
  }

  const totalMostrado = resultado?.totalFinal ?? vista?.totalActual ?? totalInicial;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-tarjeta border border-borde bg-superficie p-5 shadow-clinica sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
              <Database aria-hidden size={20} strokeWidth={1.5} className="text-teal" />
              Catálogo de medicamentos
            </h2>
            <p className="mt-1.5 max-w-prose text-sm text-texto-secundario">
              Vuelve a leer la hoja de cálculo de medicamentos y actualiza el
              catálogo que alimenta el buscador de la receta. Se puede correr
              cuantas veces haga falta: los medicamentos que ya están se
              actualizan, no se duplican.
            </p>
          </div>

          <div className="shrink-0 rounded-control bg-navy-tint px-4 py-3 text-center">
            <p className="identificador text-2xl font-semibold text-navy">
              {totalMostrado ?? "—"}
            </p>
            <p className="text-xs text-texto-secundario">en el catálogo</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-borde pt-5">
          <button
            type="button"
            onClick={verQueCambiaria}
            disabled={ocupado}
            className="flex items-center justify-center gap-2 rounded-control bg-teal px-5 py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {operacion === "vista" ? (
              <Loader2 aria-hidden size={18} strokeWidth={2} className="animate-spin" />
            ) : (
              <Eye aria-hidden size={18} strokeWidth={1.5} />
            )}
            {operacion === "vista" ? "Leyendo la hoja…" : "Ver qué cambiaría"}
          </button>

          <p className="text-sm text-texto-secundario">
            Primero se mira. Nada se escribe en este paso.
          </p>
        </div>

        {/* Un solo punto de anuncio para lector de pantalla: los estados de
            carga no tienen texto propio más allá del botón. */}
        <p aria-live="polite" className="sr-only">
          {operacion === "vista"
            ? "Leyendo la hoja de cálculo."
            : operacion === "importacion"
              ? "Importando el catálogo."
              : ""}
        </p>
      </section>

      {error ? <Aviso tono="error" texto={error} /> : null}

      {vista ? (
        <VistaPreviaCatalogo
          vista={vista}
          confirmado={confirmado}
          alConfirmar={setConfirmado}
          idConfirmacion={idConfirmacion}
          importando={operacion === "importacion"}
          ocupado={ocupado}
          alImportar={importarDeVerdad}
        />
      ) : null}

      {resultado ? <ResultadoFinal resultado={resultado} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function VistaPreviaCatalogo({
  vista,
  confirmado,
  alConfirmar,
  idConfirmacion,
  importando,
  ocupado,
  alImportar,
}: {
  vista: VistaPrevia;
  confirmado: boolean;
  alConfirmar: (valor: boolean) => void;
  idConfirmacion: string;
  importando: boolean;
  ocupado: boolean;
  alImportar: () => void;
}) {
  const escribeAlgo = vista.nuevos.length > 0 || vista.cambianGenerico.length > 0;

  return (
    <section className="rounded-tarjeta border border-borde bg-superficie p-5 shadow-clinica sm:p-6">
      <h3 className="text-base font-semibold text-navy">Vista previa</h3>
      <p className="mt-1 text-sm text-texto-secundario">
        Esto es lo que haría la importación. Todavía no se ha escrito nada.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato valor={vista.nuevos.length} etiqueta="se agregarían" destacado={vista.nuevos.length > 0} />
        <Dato
          valor={vista.cambianGenerico.length}
          etiqueta="cambiarían de principio activo"
          destacado={vista.cambianGenerico.length > 0}
        />
        <Dato valor={vista.sinCambio} etiqueta="ya están idénticos" />
        <Dato valor={vista.totalActual ?? 0} etiqueta="en el catálogo hoy" />
      </div>

      <DetalleDelSheet resumen={vista.resumen} />

      {vista.nuevos.length > 0 ? (
        <Lista titulo={`Se agregarían (${vista.nuevos.length})`} icono="nuevo">
          {vista.nuevos.map((m) => (
            <li key={m.nombre_comercial} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-navy">{m.nombre_comercial}</span>
              <span className="text-texto-secundario">{m.nombre_generico}</span>
            </li>
          ))}
        </Lista>
      ) : null}

      {vista.cambianGenerico.length > 0 ? (
        <Lista titulo={`Cambiarían de principio activo (${vista.cambianGenerico.length})`} icono="cambio">
          {vista.cambianGenerico.map((m) => (
            <li key={m.nombre_comercial} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-navy">{m.nombre_comercial}</span>
              <span className="text-texto-secundario">{m.antes}</span>
              <ArrowRight aria-hidden size={14} className="text-texto-secundario" />
              <span className="text-navy">{m.despues}</span>
            </li>
          ))}
        </Lista>
      ) : null}

      <Duplicados conflictos={vista.resumen.conflictos} />

      {/* ---- El paso 2: casilla + botón ---------------------------------- */}
      <div className="mt-6 rounded-tarjeta border border-borde bg-navy-tint p-4 sm:p-5">
        {escribeAlgo ? null : (
          <p className="mb-3 text-sm text-texto-secundario">
            El Sheet no trae nada nuevo: importar ahora dejaría el catálogo
            exactamente como está. Es inofensivo, pero probablemente no haga
            falta.
          </p>
        )}

        <label htmlFor={idConfirmacion} className="flex items-start gap-3 text-sm text-navy">
          <input
            id={idConfirmacion}
            type="checkbox"
            checked={confirmado}
            disabled={ocupado}
            onChange={(evento) => alConfirmar(evento.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-teal)]"
          />
          <span>
            Revisé el resumen y quiero escribir estos cambios en el catálogo.
          </span>
        </label>

        <button
          type="button"
          onClick={alImportar}
          disabled={!confirmado || ocupado}
          className="mt-4 flex items-center justify-center gap-2 rounded-control bg-teal px-5 py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {importando ? (
            <Loader2 aria-hidden size={18} strokeWidth={2} className="animate-spin" />
          ) : (
            <RefreshCw aria-hidden size={18} strokeWidth={1.5} />
          )}
          {importando ? "Importando…" : "Confirmar importación"}
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function ResultadoFinal({ resultado }: { resultado: ResultadoImportacion }) {
  return (
    <section className="rounded-tarjeta border border-teal bg-superficie p-5 shadow-clinica sm:p-6">
      <h3 className="flex items-center gap-2 text-base font-semibold text-navy">
        <CheckCircle2 aria-hidden size={20} strokeWidth={1.5} className="text-teal" />
        Importación completa
      </h3>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato valor={resultado.nuevos} etiqueta="agregados" destacado={resultado.nuevos > 0} />
        <Dato
          valor={resultado.actualizados}
          etiqueta="cambiaron de principio activo"
          destacado={resultado.actualizados > 0}
        />
        <Dato valor={resultado.escritos} etiqueta="comerciales enviados" />
        <Dato valor={resultado.totalFinal ?? 0} etiqueta="total en el catálogo" destacado />
      </div>

      <DetalleDelSheet resumen={resultado.resumen} />
      <Duplicados conflictos={resultado.resumen.conflictos} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Lo que el script imprime como "Resumen" y que no cambia entre la vista previa
 * y el resultado: son propiedades del Sheet, no de la escritura.
 */
function DetalleDelSheet({ resumen }: { resumen: ResumenImportacion }) {
  return (
    <>
      <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-borde pt-4 text-sm sm:grid-cols-2">
        <Renglon
          termino="Principios activos leídos"
          valor={`${resumen.principiosActivos}`}
          nota={
            resumen.principiosSinComerciales > 0
              ? `${resumen.principiosSinComerciales} sin ningún comercial cargado aún`
              : undefined
          }
        />
        <Renglon termino="Medicamentos comerciales leídos" valor={`${resumen.comercialesLeidos}`} />
        <Renglon
          termino="Celdas vacías omitidas"
          valor={`${resumen.celdasVacias}`}
          nota="normal: el Sheet se llena por partes"
        />
        {resumen.repetidosMismoGenerico > 0 ? (
          <Renglon
            termino="Repetidos bajo el mismo principio activo"
            valor={`${resumen.repetidosMismoGenerico}`}
            nota="se ignoró la copia; no hay nada que revisar"
          />
        ) : null}
      </dl>

      {resumen.columnasSinEncabezado > 0 ? (
        <Aviso
          tono="aviso"
          texto={`${resumen.columnasSinEncabezado} columna(s) traen nombres comerciales pero no tienen principio activo en la fila 1. Se omitieron enteras: sin encabezado no hay forma de saber a qué genérico pertenecen.`}
        />
      ) : null}

      {resumen.rangoRecortado ? (
        <Aviso
          tono="aviso"
          // Sin nombrar la variable de entorno: es una pantalla para la
          // doctora, no una consola, y de paso la comprobación de que ningún
          // valor de configuración llega al navegador no tiene que distinguir
          // entre el nombre de la variable y su valor.
          texto={`La lectura llega hasta la columna ${resumen.rangoRecortado.tope} y los datos ocupan justo esas columnas. Puede que la hoja siga a la derecha y se esté leyendo a medias: avisa a soporte para que revise el rango configurado antes de fiarte de este resumen.`}
        />
      ) : null}
    </>
  );
}

function Duplicados({ conflictos }: { conflictos: ResumenImportacion["conflictos"] }) {
  if (conflictos.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-texto-secundario">
        <CheckCircle2 aria-hidden size={16} strokeWidth={1.5} className="text-teal" />
        Sin nombres comerciales repetidos bajo principios activos distintos.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-tarjeta border border-rojo bg-rojo-tint p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-rojo">
        <AlertTriangle aria-hidden size={16} strokeWidth={1.5} />
        {conflictos.length} nombre(s) comercial(es) bajo principios activos distintos
      </h4>
      <p className="mt-1 text-sm text-navy">
        Casi siempre es un error de tipeo en la hoja. Se conserva la primera
        aparición (la columna más a la izquierda); corrígelo en el Sheet y
        vuelve a importar — es repetible, no hay nada que limpiar.
      </p>
      <ul className="mt-3 flex flex-col gap-3 text-sm">
        {conflictos.map((c) => (
          <li key={`${c.nombre_comercial}-${c.celda_descartada}`}>
            <p className="font-medium text-navy">{c.nombre_comercial}</p>
            <p className="text-texto-secundario">
              se guarda como <span className="text-navy">{c.generico_conservado}</span>{" "}
              <span className="identificador text-xs">({c.celda_conservada})</span>
            </p>
            <p className="text-texto-secundario">
              se descarta <span className="text-navy">{c.generico_descartado}</span>{" "}
              <span className="identificador text-xs">({c.celda_descartada})</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- Piezas menudas ------------------------------------------------------- */

function Dato({
  valor,
  etiqueta,
  destacado = false,
}: {
  valor: number;
  etiqueta: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-control border px-3 py-2.5 ${
        destacado ? "border-teal bg-teal-tint" : "border-borde bg-superficie"
      }`}
    >
      <p className={`identificador text-xl font-semibold ${destacado ? "text-teal" : "text-navy"}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs leading-4 text-texto-secundario">{etiqueta}</p>
    </div>
  );
}

function Renglon({ termino, valor, nota }: { termino: string; valor: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borde/60 py-1.5">
      <dt className="text-texto-secundario">
        {termino}
        {nota ? <span className="block text-xs">{nota}</span> : null}
      </dt>
      <dd className="identificador shrink-0 font-medium text-navy">{valor}</dd>
    </div>
  );
}

function Lista({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: "nuevo" | "cambio";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-navy">
        {icono === "nuevo" ? (
          <Plus aria-hidden size={16} strokeWidth={2} className="text-teal" />
        ) : (
          <RefreshCw aria-hidden size={16} strokeWidth={1.5} className="text-teal" />
        )}
        {titulo}
      </h4>
      {/* Lista larga: se limita el alto y se desplaza aquí dentro, para que el
          botón de confirmar no acabe a mil píxeles del resumen. */}
      <ul className="mt-2 max-h-64 overflow-y-auto rounded-control border border-borde bg-navy-tint p-3 text-sm">
        {children}
      </ul>
    </div>
  );
}

function Aviso({ tono, texto }: { tono: "error" | "aviso"; texto: string }) {
  const esError = tono === "error";
  return (
    <div
      role="alert"
      className={`mt-4 flex items-start gap-2.5 rounded-tarjeta border px-4 py-3 text-sm ${
        esError ? "border-rojo bg-rojo-tint text-navy" : "border-borde bg-navy-tint text-navy"
      }`}
    >
      {esError ? (
        <XCircle aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-rojo" />
      ) : (
        <AlertTriangle aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-navy" />
      )}
      <p>{texto}</p>
    </div>
  );
}
