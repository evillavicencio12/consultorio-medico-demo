"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Pill, Search } from "lucide-react";
import {
  MINIMO_CARACTERES_MEDICAMENTO,
  type ResultadoMedicamentos,
} from "@/lib/consultas/medicamentos";
import type { MedicamentoCatalogoRow } from "@/lib/supabase/tipos";
import { AvisoCatalogo, Etiqueta, MensajeError, bordeDe, type FalloCatalogo } from "./controles";

/**
 * Autocompletado del catálogo de medicamentos (RF-14) sobre los 162 importados
 * desde el Sheet (docs/integraciones/Contrato-Sheet-Medicamentos.md).
 *
 * Busca por nombre genérico y comercial a la vez, porque así se busca un
 * medicamento: se teclea lo que se recuerde, no se elige antes cuál de los dos
 * nombres es. Al elegir una sugerencia se rellenan **los dos** campos del
 * renglón, que es lo que la mitad "Rp" de la receta imprime.
 *
 * **Se puede escribir un medicamento que no esté en el catálogo.** El campo no
 * es un desplegable cerrado: el catálogo orienta y ahorra tecleo, pero la
 * doctora receta lo que tiene que recetar, esté o no en un Sheet que todavía se
 * está llenando. Por eso lo que viaja al guardar es el texto de los campos, no
 * un id del catálogo — y por eso `receta_medicamentos` copia los nombres en vez
 * de referenciarlos (Modelo-de-Datos.md: la receta conserva lo que se recetó
 * ese día aunque el catálogo cambie después).
 *
 * La búsqueda llega como prop, no importada: es la Server Action, y traérsela
 * aquí arrastraría `server-only` al bundle del cliente. Mismo criterio que el
 * buscador de CIE-10.
 */

/** Si el catálogo no responde: el campo sigue siendo texto libre. */
const SIN_CATALOGO = "No se pudo consultar el catálogo. Puedes escribir el medicamento a mano.";

export type BuscarMedicamentos = (texto: string) => Promise<ResultadoMedicamentos>;

const REPOSO_MS = 200;

export function BuscadorMedicamentos({
  campo,
  valorGenerico,
  valorComercial,
  onElegir,
  onEscribirComercial,
  buscar,
  error,
}: {
  campo: string;
  valorGenerico: string;
  valorComercial: string;
  /** Rellena genérico y comercial de una vez. */
  onElegir: (fila: MedicamentoCatalogoRow) => void;
  /** Lo tecleado a mano, cuando el medicamento no está en el catálogo. */
  onEscribirComercial: (valor: string) => void;
  buscar: BuscarMedicamentos;
  error?: string;
}) {
  const idLista = useId();
  const [sugerencias, setSugerencias] = useState<MedicamentoCatalogoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [buscando, setBuscando] = useState(false);
  // El aviso bajo el campo: catálogo caído, o la sesión caducada (ver AvisoCatalogo).
  const [fallo, setFallo] = useState<FalloCatalogo | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);

  /**
   * Cada búsqueda lleva número: sin esto, la respuesta de "amo" puede llegar
   * después de la de "amoxicilina" y pintar sugerencias viejas sobre lo que ya
   * se tecleó.
   */
  const peticion = useRef(0);
  const buscable = valorComercial.trim().length >= MINIMO_CARACTERES_MEDICAMENTO;

  useEffect(() => {
    if (!buscable) return;
    const mia = ++peticion.current;
    const temporizador = setTimeout(() => {
      setBuscando(true);
      buscar(valorComercial)
        .then((resultado) => {
          if (peticion.current !== mia) return;
          setSugerencias(resultado.sugerencias);
          setTotal(resultado.total);
          setFallo(resultado.mensaje ? { texto: resultado.mensaje, bloquea: true } : null);
          setResaltado(0);
        })
        .catch(() => {
          if (peticion.current !== mia) return;
          // Que el catálogo no responda no puede impedir recetar: el campo
          // sigue siendo texto y se puede escribir a mano.
          setSugerencias([]);
          setTotal(0);
          setFallo({ texto: SIN_CATALOGO, bloquea: false });
        })
        .finally(() => {
          if (peticion.current === mia) setBuscando(false);
        });
    }, REPOSO_MS);
    return () => clearTimeout(temporizador);
    // `buscar` es una Server Action estable; incluirla volvería a agendar la
    // búsqueda en cada render del formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorComercial, buscable]);

  const escribir = (valor: string) => {
    onEscribirComercial(valor);
    setAbierto(true);
    if (valor.trim().length < MINIMO_CARACTERES_MEDICAMENTO) {
      peticion.current += 1;
      setSugerencias([]);
      setTotal(0);
      setFallo(null);
      setBuscando(false);
    }
  };

  const elegir = (fila: MedicamentoCatalogoRow) => {
    onElegir(fila);
    setAbierto(false);
    setSugerencias([]);
  };

  const hayLista = abierto && buscable && sugerencias.length > 0;

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Etiqueta campo={campo} etiqueta="Nombre comercial" obligatorio />
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
          id={campo}
          name={campo}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={hayLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={
            hayLista && sugerencias[resaltado] ? `${idLista}-${resaltado}` : undefined
          }
          value={valorComercial}
          onChange={(e) => escribir(e.target.value)}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={(e) => {
            if (!hayLista) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setResaltado((i) => (i + 1) % sugerencias.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setResaltado((i) => (i - 1 + sugerencias.length) % sugerencias.length);
            } else if (e.key === "Enter") {
              // Enter elige del catálogo; no envía el formulario entero.
              e.preventDefault();
              elegir(sugerencias[resaltado]);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
          placeholder="Ej. AMOXIFAR, o amoxicilina"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${campo}-error` : undefined}
          className={`w-full rounded-control border bg-superficie py-2.5 pr-3 pl-10 text-[15px] text-navy transition-colors focus:outline-none ${bordeDe(
            error
          )}`}
        />

        {hayLista ? (
          <ul
            id={idLista}
            role="listbox"
            aria-label="Medicamentos del catálogo"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-tarjeta border border-borde bg-superficie py-1 shadow-clinica"
          >
            {sugerencias.map((fila, indice) => (
              <li key={fila.id}>
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
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                    indice === resaltado ? "bg-teal-tint" : "hover:bg-navy-tint"
                  }`}
                >
                  <span className="text-sm font-semibold text-navy">{fila.nombre_comercial}</span>
                  <span className="text-xs text-texto-secundario">{fila.nombre_generico}</span>
                </button>
              </li>
            ))}
            {total > sugerencias.length ? (
              <li className="border-t border-borde px-3 pt-2 pb-1 text-xs text-texto-secundario">
                Mostrando {sugerencias.length} de {total}. Escribe más para afinar.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <MensajeError campo={campo} error={error} />

      <AvisoCatalogo fallo={fallo} />

      {/* Que el catálogo no lo tenga es normal: se está llenando, y hoy 22 de
          sus 67 principios activos todavía no traen ningún comercial. */}
      {buscable && !buscando && !fallo && sugerencias.length === 0 && valorGenerico.trim() === "" ? (
        <p className="flex items-start gap-1.5 text-sm text-texto-secundario">
          <Pill aria-hidden className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} />
          No está en el catálogo. Puedes recetarlo igual: escribe también el
          nombre genérico.
        </p>
      ) : null}
    </div>
  );
}
