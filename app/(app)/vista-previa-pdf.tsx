"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Printer, X } from "lucide-react";
import { ContenidoExcedeEspacioError, crearVistaPreviaPdf } from "@/lib/pdf";

/**
 * Vista previa de un PDF **sobre la pantalla actual** (RF-19).
 *
 * 06-Generador-PDF.md lo pide así con todas las letras: "una vista previa
 * dentro de la misma página (sin navegar a otra URL ni forzar descarga), con
 * opción de imprimir ahí mismo". Descargar el archivo para verlo obligaría a
 * salir del sistema, abrir el visor de PDF del escritorio y volver, con un
 * archivo suelto en la carpeta de Descargas por cada consulta mirada.
 *
 * **Vive en `app/(app)/` y no dentro de `pacientes/` a propósito.** Lo usa la
 * línea de tiempo de la ficha, y la Fase 4 lo va a necesitar igual cuando se
 * genere una consulta nueva; ahí es donde la vista previa importa más, porque
 * es lo último que se mira antes de imprimir y firmar.
 *
 * ## Por qué `<dialog>` nativo
 *
 * Da gratis lo que un `<div>` con posición fija obliga a escribir a mano y casi
 * nadie escribe bien: atrapar el foco dentro del modal, cerrar con `Escape`,
 * marcar el resto de la página como inerte para los lectores de pantalla, y
 * quedar por encima de todo sin pelear con `z-index`. Es la misma decisión que
 * el rail tomó con los tooltips: CSS y HTML puros antes que una librería.
 *
 * ## El PDF se genera aquí, en el navegador
 *
 * `generar()` la pasa quien abre la vista previa. No se recibe el PDF ya hecho
 * porque generarlo cuesta —cargar la plantilla, incrustar la fuente— y hacerlo
 * al montar la pantalla significaría generar un PDF por cada consulta de la
 * línea de tiempo, incluidos los que nadie va a mirar.
 */
export function VistaPreviaPdf({
  titulo,
  descripcion,
  generar,
  onCerrar,
}: {
  titulo: string;
  /** Qué consulta es. Se lee bajo el título, en el encabezado del modal. */
  descripcion?: string;
  /** Devuelve los bytes del PDF. Puede lanzar `ContenidoExcedeEspacioError`. */
  generar: () => Promise<Uint8Array>;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const marco = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `showModal()` no se puede poner en el JSX: es imperativo, y es lo que
  // activa el foco atrapado y el fondo inerte. Sin él, un `<dialog open>` es
  // un cuadro más de la página.
  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    // `cancelado` evita pintar el resultado de una generación cuya vista previa
    // ya se cerró — y, sobre todo, evita filtrar el object URL de esa
    // generación huérfana.
    let cancelado = false;
    let liberar: (() => void) | null = null;

    generar()
      .then((bytes) => {
        const vista = crearVistaPreviaPdf(bytes);
        if (cancelado) {
          vista.dispose();
          return;
        }
        liberar = vista.dispose;
        setUrl(vista.url);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        // ADR-005 / ADR-007: el contenido no cabe en el espacio impreso. El
        // error ya nombra el campo concreto, así que se muestra tal cual en vez
        // de traducirlo a un "no se pudo generar" que no diría qué arreglar.
        setError(
          e instanceof ContenidoExcedeEspacioError
            ? e.message
            : "No se pudo generar el PDF. Vuelve a intentarlo; si sigue fallando, avisa a soporte."
        );
        if (!(e instanceof ContenidoExcedeEspacioError)) console.error("[pdf] fallo al generar:", e);
      });

    return () => {
      cancelado = true;
      // Sin esto, cada vista previa abierta deja su blob en memoria hasta que
      // se recargue la página.
      liberar?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imprimir = () => {
    // Se imprime el marco, no la página: `window.print()` sacaría el rail y la
    // ficha por la impresora en vez del documento. El blob: URL es del mismo
    // origen que esta página, así que se puede alcanzar su `contentWindow`.
    const ventana = marco.current?.contentWindow;
    if (!ventana) return;
    ventana.focus();
    ventana.print();
  };

  return (
    <dialog
      ref={dialogo}
      // `onClose` cubre las dos salidas que el navegador maneja por su cuenta:
      // la tecla Escape y `close()`. Sin él, cerrar con Escape dejaría el
      // estado de React creyendo que la vista previa sigue abierta.
      onClose={onCerrar}
      // Clic fuera de la tarjeta = cerrar. El `::backdrop` es el propio
      // `<dialog>`, así que el evento llega con `target` en el diálogo.
      onClick={(e) => {
        if (e.target === dialogo.current) dialogo.current?.close();
      }}
      aria-label={titulo}
      className="m-auto h-[92dvh] w-[min(92vw,900px)] rounded-tarjeta border border-borde bg-superficie p-0 shadow-clinica backdrop:bg-navy/40"
    >
      {/* `h-full` + `flex-col` para que el visor se lleve todo el alto que
          sobra y el modal no crezca más allá del diálogo — el mismo criterio
          del armazón: un solo elemento con scroll, aquí el propio visor. */}
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-borde px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-navy">{titulo}</h2>
            {descripcion ? (
              <p className="mt-0.5 truncate text-sm text-texto-secundario">{descripcion}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={imprimir}
              disabled={!url}
              className="flex items-center gap-2 rounded-control bg-teal px-4 py-2 font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer aria-hidden size={18} strokeWidth={1.5} />
              Imprimir
            </button>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              aria-label="Cerrar vista previa"
              className="rounded-control p-2 text-navy transition-colors hover:bg-navy-tint hover:text-teal"
            >
              <X aria-hidden size={20} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 bg-navy-tint">
          {error ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
            >
              <AlertCircle aria-hidden className="text-rojo" size={28} strokeWidth={1.5} />
              <p className="font-semibold text-rojo">No se pudo generar el documento</p>
              <p className="max-w-lg text-sm text-navy">{error}</p>
            </div>
          ) : url ? (
            <iframe
              ref={marco}
              src={url}
              title={titulo}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2
                aria-hidden
                className="animate-spin text-teal"
                size={28}
                strokeWidth={1.5}
              />
              <p className="text-sm text-texto-secundario">Generando el documento…</p>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
