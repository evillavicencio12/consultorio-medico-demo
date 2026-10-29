"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Search, X } from "lucide-react";
import {
  LIMITE_SUGERENCIAS,
  MINIMO_CARACTERES_CIE10,
  type ResultadoCie10,
  type TipoBusquedaCie10,
} from "@/lib/consultas/cie10";
import type { Cie10CatalogoRow } from "@/lib/supabase/tipos";
import { AvisoCatalogo, type FalloCatalogo } from "./controles";

/**
 * Autocompletado del catálogo CIE-10 (RF-11) sobre los cerca de 12.900 códigos
 * importados.
 *
 * La consulta la resuelve Postgres con `idx_cie10_descripcion`; aquí solo vive
 * la interacción.
 *
 * **La búsqueda llega como prop, no importada.** Es la Server Action de
 * `lib/consultas/acciones.ts`, que el Server Component pasa hacia abajo. Si
 * este archivo la importara, arrastraría al bundle del cliente la cadena
 * `lib/supabase/server.ts` → `server-only` — y de paso haría imposible
 * renderizar este componente en una prueba sin sesión ni base de datos, que es
 * como se comprueban las pantallas de este proyecto.
 *
 * ## Lo que se elige queda dicho entero, no como un código suelto
 *
 * "J069" no significa nada al releer la ficha tres meses después. Por eso, una
 * vez elegido, el código deja de ser un campo de texto y pasa a ser una tarjeta
 * con el código en mono y su descripción completa, con el check turquesa que
 * docs/diseno/Prompts-Stitch.md pide para el CIE-10 válido. El valor que viaja en el
 * formulario sigue siendo solo el código, que es lo que guarda la columna
 * `consultas.cie10_codigo` (FK contra el catálogo).
 *
 * ## Por qué un combobox a mano y no una librería
 *
 * Es el mismo criterio con el que la vista previa usa `<dialog>` nativo y el
 * rail usa tooltips de CSS: aquí no hay nada nativo que haga esto —`<datalist>`
 * no permite mostrar dos líneas por opción ni saber qué se eligió—, así que se
 * escribe el patrón ARIA de combobox con lista, que son unas pocas decenas de
 * líneas, en vez de traer una dependencia entera al bundle.
 */

/** Lo que el resto del formulario necesita saber del código elegido. */
export type Cie10Elegido = Cie10CatalogoRow;

const REPOSO_MS = 200;

/** Si el catálogo no responde: la consulta se registra igual. */
const SIN_CATALOGO =
  "No se pudo consultar el catálogo. La consulta se puede registrar igual; el código es opcional.";

export type BuscarCie10 = (texto: string) => Promise<ResultadoCie10>;

export function BuscadorCie10({
  elegido,
  onElegir,
  buscar,
  error,
  campo = "cie10_codigo",
}: {
  elegido: Cie10Elegido | null;
  onElegir: (fila: Cie10Elegido | null) => void;
  /** La Server Action `buscarCie10Accion`, pasada desde el Server Component. */
  buscar: BuscarCie10;
  error?: string;
  campo?: string;
}) {
  const idLista = useId();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Cie10CatalogoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [tipo, setTipo] = useState<TipoBusquedaCie10>("descripcion");
  const [buscando, setBuscando] = useState(false);
  // El aviso bajo el campo: catálogo caído, o la sesión caducada (ver AvisoCatalogo).
  const [fallo, setFallo] = useState<FalloCatalogo | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);

  const entrada = useRef<HTMLInputElement>(null);
  /**
   * Cada búsqueda lleva número. Sin esto, la respuesta de "far" puede llegar
   * después de la de "faringitis" y pintar las sugerencias equivocadas sobre lo
   * que ya se tecleó — el clásico de todo autocompletado.
   */
  const peticion = useRef(0);

  const buscable = texto.trim().length >= MINIMO_CARACTERES_CIE10;

  // El efecto solo AGENDA la búsqueda; no toca el estado en su cuerpo. Limpiar
  // las sugerencias cuando el texto se queda corto es cosa de `escribir`, que
  // es quien sabe que lo tecleado cambió — un efecto que llama a setState
  // encadena renders sin necesidad.
  useEffect(() => {
    if (!buscable) return;

    const mia = ++peticion.current;
    const temporizador = setTimeout(() => {
      setBuscando(true);
      buscar(texto)
        .then((resultado) => {
          if (peticion.current !== mia) return;
          setSugerencias(resultado.sugerencias);
          setTotal(resultado.total);
          setTipo(resultado.tipo);
          setFallo(resultado.mensaje ? { texto: resultado.mensaje, bloquea: true } : null);
          setResaltado(0);
          setAbierto(true);
        })
        .catch(() => {
          if (peticion.current !== mia) return;
          // Que el catálogo no responda no puede dejar a la doctora sin
          // registrar la consulta: el código es opcional y el aviso lo dice.
          setSugerencias([]);
          setTotal(0);
          setFallo({ texto: SIN_CATALOGO, bloquea: false });
        })
        .finally(() => {
          if (peticion.current === mia) setBuscando(false);
        });
    }, REPOSO_MS);

    return () => clearTimeout(temporizador);
    // `buscar` es una Server Action estable; incluirla en las dependencias
    // volvería a agendar la búsqueda en cada render del formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, buscable]);

  /**
   * Lo tecleado, y el borrado de lo que ya no corresponde.
   *
   * Al bajar del mínimo de caracteres se descartan las sugerencias en el acto y
   * se invalida la petición en vuelo (subiendo el contador): si no, la
   * respuesta de "farin" llegaría después de borrar y volvería a abrir la lista
   * sobre un campo vacío.
   */
  const escribir = (valor: string) => {
    setTexto(valor);
    setAbierto(true);
    if (valor.trim().length < MINIMO_CARACTERES_CIE10) {
      peticion.current += 1;
      setSugerencias([]);
      setTotal(0);
      setFallo(null);
      setBuscando(false);
    }
  };

  const elegir = (fila: Cie10CatalogoRow) => {
    onElegir(fila);
    escribir("");
    setAbierto(false);
  };

  const quitar = () => {
    onElegir(null);
    escribir("");
    // El foco vuelve al campo: quitar un código casi siempre es el primer paso
    // de poner otro.
    requestAnimationFrame(() => entrada.current?.focus());
  };

  if (elegido) {
    return (
      <div className="flex flex-col gap-2 sm:col-span-2">
        <span className="text-[13px] font-semibold tracking-[0.05em] text-navy">
          CÓDIGO CIE-10
        </span>
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-teal bg-teal-tint px-3 py-2.5">
          <p className="flex min-w-0 items-start gap-2 text-[15px] text-navy">
            <Check aria-hidden className="mt-0.5 shrink-0 text-teal" size={18} strokeWidth={1.5} />
            <span className="min-w-0">
              <span className="identificador font-semibold">{elegido.codigo}</span>
              <span className="mx-1.5 text-texto-secundario">·</span>
              {elegido.descripcion}
            </span>
          </p>
          <button
            type="button"
            onClick={quitar}
            className="flex shrink-0 items-center gap-1.5 rounded-control border border-navy px-2.5 py-1 text-sm font-semibold text-navy transition-colors hover:bg-superficie"
          >
            <X aria-hidden size={14} strokeWidth={1.5} />
            Cambiar
          </button>
        </div>
        {/* El valor que se envía es solo el código: es lo que guarda la columna
            y lo que imprime el PDF junto a la impresión diagnóstica. */}
        <input type="hidden" name={campo} value={elegido.codigo} />
        <p className="text-sm text-texto-secundario">
          Se imprime pegado a la impresión diagnóstica, y por eso cuenta para su
          límite de caracteres.
        </p>
      </div>
    );
  }

  const hayLista = abierto && buscable && (sugerencias.length > 0 || (!buscando && !fallo));

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <label
        htmlFor={campo}
        className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold tracking-[0.05em] text-navy"
      >
        CÓDIGO CIE-10
        <span className="text-[11px] font-medium tracking-normal text-texto-secundario">
          Opcional · busca por diagnóstico o por código
        </span>
      </label>

      <div className="relative">
        {buscando ? (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 animate-spin text-teal"
            size={18}
            strokeWidth={1.5}
          />
        ) : (
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-secundario"
            size={18}
            strokeWidth={1.5}
          />
        )}

        <input
          ref={entrada}
          id={campo}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={hayLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={
            hayLista && sugerencias[resaltado] ? `${idLista}-${resaltado}` : undefined
          }
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          onFocus={() => setAbierto(true)}
          // El cierre se retrasa para que el clic sobre una sugerencia llegue
          // antes de que la lista desaparezca.
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={(e) => {
            if (!hayLista || sugerencias.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setResaltado((i) => (i + 1) % sugerencias.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setResaltado((i) => (i - 1 + sugerencias.length) % sugerencias.length);
            } else if (e.key === "Enter") {
              // Se frena el submit: Enter dentro del buscador elige el código,
              // no envía el formulario entero.
              e.preventDefault();
              elegir(sugerencias[resaltado]);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
          placeholder="Ej. faringitis aguda, o J069"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${campo}-error` : undefined}
          className={`w-full rounded-control border bg-superficie py-2.5 pr-3 pl-10 text-[15px] text-navy transition-colors focus:outline-none ${
            error ? "border-rojo focus:border-rojo" : "border-borde focus:border-navy"
          }`}
        />

        {hayLista ? (
          <ul
            id={idLista}
            role="listbox"
            aria-label="Códigos CIE-10 encontrados"
            className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-tarjeta border border-borde bg-superficie py-1 shadow-clinica"
          >
            {sugerencias.map((fila, indice) => (
              <li key={fila.codigo}>
                <button
                  type="button"
                  id={`${idLista}-${indice}`}
                  role="option"
                  aria-selected={indice === resaltado}
                  onMouseEnter={() => setResaltado(indice)}
                  // `onMouseDown` y no `onClick`: el blur del input dispara
                  // antes que el click y cerraría la lista bajo el cursor.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(fila);
                  }}
                  className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                    indice === resaltado ? "bg-teal-tint" : "hover:bg-navy-tint"
                  }`}
                >
                  <span className="identificador shrink-0 text-sm font-semibold text-navy">
                    {fila.codigo}
                  </span>
                  <span className="text-sm text-navy">{fila.descripcion}</span>
                </button>
              </li>
            ))}

            {sugerencias.length === 0 ? (
              <li className="px-3 py-2 text-sm text-texto-secundario">
                Ningún código coincide con “{texto.trim()}”. Prueba con otra
                palabra del diagnóstico.
              </li>
            ) : null}

            {total > sugerencias.length ? (
              <li className="border-t border-borde px-3 pt-2 pb-1 text-xs text-texto-secundario">
                Mostrando {sugerencias.length} de {total}
                {tipo === "codigo" ? " códigos que empiezan así" : " coincidencias"}. Afina la
                búsqueda para ver el resto.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <AvisoCatalogo fallo={fallo} />

      {error ? (
        <p id={`${campo}-error`} className="flex items-start gap-1.5 text-sm text-rojo">
          <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} />
          {error}
        </p>
      ) : null}

      {!buscable && texto.trim().length > 0 ? (
        <p className="text-sm text-texto-secundario">
          Escribe al menos {MINIMO_CARACTERES_CIE10} caracteres.
        </p>
      ) : null}

      {/* Sin código elegido no viaja nada en el formulario: la columna acepta
          NULL y una cadena vacía rompería la clave foránea contra el catálogo. */}
      <noscript>
        <p className="text-sm text-texto-secundario">
          El buscador de códigos necesita JavaScript. La consulta se puede
          registrar sin código.
        </p>
      </noscript>
      <p className="sr-only" aria-live="polite">
        {fallo
          ? // El error de sesión ya lo anuncia su role="alert"; aquí, el aviso de catálogo.
            fallo.bloquea
            ? ""
            : fallo.texto
          : buscable && !buscando
          ? total === 0
            ? "Ningún código encontrado."
            : `${Math.min(total, LIMITE_SUGERENCIAS)} de ${total} códigos.`
          : ""}
      </p>
    </div>
  );
}
