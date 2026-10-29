"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, CircleDashed, Clock, Loader2, Plus, Search, X } from "lucide-react";
import {
  MINIMO_CARACTERES,
  ORDEN_POR_DEFECTO,
  PARAM_BUSQUEDA,
  PARAM_INCOMPLETAS,
  PARAM_ORDEN,
  PARAM_PARA,
  PARA_CONSULTA,
  type Orden,
} from "@/lib/pacientes/busqueda";
import { contarPacientes } from "@/lib/pacientes/formato";

/**
 * Barra de control del listado: buscador, orden y filtro de fichas incompletas.
 *
 * **Por qué el estado vive en la URL y no en este componente.** Cada tecla
 * (con 200ms de reposo) hace `router.replace`, el Server Component vuelve a
 * consultar y Postgres resuelve el filtro con `idx_pacientes_nombre`. La
 * alternativa —traer los 164 pacientes y filtrarlos aquí— se descartó: hoy
 * funcionaría y el día que la base tenga miles de pacientes habría que
 * reescribir la pantalla entera, además de mandar al navegador fichas que la
 * doctora nunca va a mirar.
 *
 * **Cuánto tarda, medido y no supuesto: ~1 s de la tecla al resultado.** No es
 * "instantáneo" en el sentido literal de RNF-09, y conviene saberlo antes de
 * intentar afinar lo que no toca: de ese segundo, 356-470 ms se los lleva el
 * `getUser()` de `proxy.ts` (verificar la sesión contra Supabase, en cada
 * petición) y solo 218-260 ms las tres consultas a la base. Está aceptado tal
 * cual —la doctora busca al empezar la consulta, no teclea en bucle— y la
 * medición completa, con la salida si algún día hace falta, está en
 * docs/modulos/02-Gestion-Pacientes.md.
 *
 * Lo que sí sale gratis: el router de Next cachea la respuesta de cada URL ya
 * visitada, así que borrar letras —la mitad de lo que uno hace al buscar— no
 * vuelve a pegarle a la base.
 *
 * No se usa `useSearchParams`: los tres parámetros llegan como props desde el
 * Server Component, que ya los leyó y validó. Un solo lugar donde se
 * interpretan, y de paso este componente no arrastra un límite de Suspense.
 */
export function BarraDeControles({
  busqueda,
  orden,
  soloIncompletas,
  paraConsulta = false,
  mostrados,
  total,
  totalGeneral,
  totalIncompletas,
  children,
}: {
  busqueda: string;
  orden: Orden;
  soloIncompletas: boolean;
  /**
   * Se llegó desde "Nueva Consulta". Viaja en cada navegación de esta barra:
   * si se perdiera al teclear —que es lo primero que se hace— buscar al
   * paciente devolvería a la ficha en lugar de a su consulta, y el ítem del
   * rail dejaría de llevar a donde dice.
   */
  paraConsulta?: boolean;
  mostrados: number;
  total: number;
  totalGeneral: number;
  totalIncompletas: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const [texto, setTexto] = useState(busqueda);
  /** Último valor que ESTA pantalla mandó a la URL. */
  const ultimoEnviado = useRef(busqueda);

  const navegar = (cambios: { q?: string; orden?: Orden; incompletas?: boolean }) => {
    const q = (cambios.q ?? texto).trim();
    const nuevoOrden = cambios.orden ?? orden;
    const incompletas = cambios.incompletas ?? soloIncompletas;

    const params = new URLSearchParams();
    if (q) params.set(PARAM_BUSQUEDA, q);
    // Los valores por defecto no se escriben: la URL de la pantalla en reposo
    // es "/pacientes" a secas, que es la que se comparte y se marca.
    if (nuevoOrden !== ORDEN_POR_DEFECTO) params.set(PARAM_ORDEN, nuevoOrden);
    if (incompletas) params.set(PARAM_INCOMPLETAS, "1");
    if (paraConsulta) params.set(PARAM_PARA, PARA_CONSULTA);

    ultimoEnviado.current = q;
    const cadena = params.toString();
    iniciarTransicion(() => {
      // `replace` y no `push`: teclear un nombre no debería dejar diez entradas
      // en el historial que haya que recorrer con "atrás".
      router.replace(cadena ? `/pacientes?${cadena}` : "/pacientes", { scroll: false });
    });
  };

  // Rebote: se consulta cuando la doctora deja de escribir, no en cada tecla.
  useEffect(() => {
    if (texto.trim() === ultimoEnviado.current) return;
    const temporizador = setTimeout(() => navegar({}), 200);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Si el cambio de URL vino de fuera (botón "atrás" del navegador), el input
  // tiene que seguirlo. Se distingue por `ultimoEnviado`: lo que escribimos
  // nosotros ya está reflejado y no debe pisar lo que se está tecleando.
  useEffect(() => {
    if (busqueda !== ultimoEnviado.current) {
      ultimoEnviado.current = busqueda;
      setTexto(busqueda);
    }
  }, [busqueda]);

  const buscando = texto.trim().length >= MINIMO_CARACTERES;
  const tecleoCorto = texto.trim().length > 0 && !buscando;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-80">
          <label htmlFor="buscar-paciente" className="sr-only">
            Buscar paciente por nombre o documento de identidad
          </label>
          {pendiente ? (
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
            id="buscar-paciente"
            type="search"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter no envía nada nuevo, pero adelanta el rebote: quien
              // teclea rápido y pulsa Enter espera resultado ya.
              if (e.key === "Enter") {
                e.preventDefault();
                navegar({});
              }
            }}
            placeholder="Buscar por nombre o documento…"
            className="w-full rounded-control border border-borde bg-superficie py-2.5 pr-10 pl-10 text-[15px] text-navy transition-colors focus:border-navy focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {texto ? (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                navegar({ q: "" });
              }}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-control p-1.5 text-texto-secundario transition-colors hover:bg-navy-tint hover:text-teal"
            >
              <X aria-hidden size={16} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>

        <Link
          href="/pacientes/nuevo"
          className="flex items-center justify-center gap-2 rounded-control bg-teal px-4 py-2.5 font-semibold text-white transition-colors hover:bg-teal-hover"
        >
          <Plus aria-hidden size={18} strokeWidth={1.5} />
          Nuevo paciente
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm text-texto-secundario">
          {tecleoCorto
            ? `Escribe al menos ${MINIMO_CARACTERES} caracteres para buscar.`
            : buscando || soloIncompletas
              ? `${contarPacientes(total)} de ${totalGeneral}`
              : contarPacientes(totalGeneral)}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <BotonFiltro
            activo={soloIncompletas}
            onClick={() => navegar({ incompletas: !soloIncompletas })}
            Icono={CircleDashed}
          >
            Fichas incompletas ({totalIncompletas})
          </BotonFiltro>

          <div
            role="group"
            aria-label="Orden del listado"
            className="flex overflow-hidden rounded-control border border-borde bg-superficie"
          >
            <BotonOrden
              activo={orden === "recientes"}
              onClick={() => navegar({ orden: "recientes" })}
              Icono={Clock}
            >
              Recientes
            </BotonOrden>
            <span aria-hidden className="w-px bg-borde" />
            <BotonOrden
              activo={orden === "alfabetico"}
              onClick={() => navegar({ orden: "alfabetico" })}
              Icono={ArrowDownAZ}
            >
              A–Z
            </BotonOrden>
          </div>
        </div>
      </div>

      {/* `aria-busy` + una opacidad mínima: se nota que la lista se está
          recalculando sin que el contenido salte ni se vacíe, que es lo que
          hace sentir lenta a una búsqueda que en realidad no lo es. */}
      <div
        aria-busy={pendiente}
        className={`transition-opacity duration-150 ${pendiente ? "opacity-60" : "opacity-100"}`}
      >
        {children}
      </div>

      {mostrados < total ? (
        <p className="mt-6 text-center text-sm text-texto-secundario">
          Mostrando {mostrados} de {total}. Afina la búsqueda para ver el resto.
        </p>
      ) : null}
    </>
  );
}

function BotonOrden({
  activo,
  onClick,
  Icono,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  Icono: typeof Clock;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
        activo ? "bg-teal-tint text-teal" : "text-navy hover:bg-navy-tint hover:text-teal"
      }`}
    >
      <Icono aria-hidden size={16} strokeWidth={1.5} />
      {children}
    </button>
  );
}

function BotonFiltro({
  activo,
  onClick,
  Icono,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  Icono: typeof CircleDashed;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center gap-1.5 rounded-control border px-3 py-2 text-sm font-medium transition-colors ${
        activo
          ? "border-teal bg-teal-tint text-teal"
          : "border-borde bg-superficie text-navy hover:bg-navy-tint hover:text-teal"
      }`}
    >
      <Icono aria-hidden size={16} strokeWidth={1.5} />
      {children}
    </button>
  );
}
