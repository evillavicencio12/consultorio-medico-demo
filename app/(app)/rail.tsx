"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardPlus,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cerrarSesion } from "@/app/login/acciones";

/**
 * Navigation rail colapsable (Sistema-de-Diseno.md).
 *
 * Expandido 240px (ícono + etiqueta), colapsado 72px (solo ícono + tooltip).
 * Los dos anchos son tokens en globals.css, no números sueltos aquí.
 *
 * ## Qué ítem hay y cuál NO (Fase 3 y Fase 5)
 *
 * Hubo uno llamado "Historial Clínico", que salía de docs/diseno/Prompts-Stitch.md.
 * Se quitó al construir la línea de tiempo, porque el historial clínico de un
 * paciente **es su ficha**: RF-20 pide la línea de tiempo "en el Historial
 * Clínico de cada paciente", y un historial sin paciente no existe.
 *
 * Un ítem de menú que lleva a una pantalla sin paciente solo puede hacer una
 * cosa —preguntar cuál—, y eso ya es /pacientes, con buscador, filtros y alta.
 * Sería una segunda puerta a la misma sala, peor equipada.
 *
 * La decisión completa, con el conflicto de documentación que resolvió, está en
 * docs/modulos/03-Historial-Clinico.md.
 *
 * "Configuración" sí entró, en la Fase 5, y no contradice lo anterior: no es
 * una segunda puerta a nada: es la única puerta a la reimportación del catálogo
 * de medicamentos (RF-13), que hasta entonces solo existía como script de
 * terminal. Va la última a propósito — es, en palabras de la definición
 * original del proyecto, una "pestaña opcional, de uso ocasional".
 */
const ITEMS: { href: string; etiqueta: string; Icono: LucideIcon }[] = [
  { href: "/pacientes", etiqueta: "Pacientes", Icono: Users },
  { href: "/nueva-consulta", etiqueta: "Nueva Consulta", Icono: ClipboardPlus },
  { href: "/configuracion", etiqueta: "Configuración", Icono: Settings },
];

export function NavigationRail() {
  const [expandido, setExpandido] = useState(true);
  const rutaActual = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      // La transición es de `width`: mover el ancho arrastra el contenido
      // principal con él, que es el efecto que se busca al maximizar espacio
      // en "Nueva Consulta".
      className={`flex shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-200 ease-out ${
        expandido ? "w-rail-expandido" : "w-rail-colapsado"
      }`}
    >
      <div
        className={`flex h-16 shrink-0 items-center border-b border-borde ${
          expandido ? "justify-between px-4" : "justify-center px-0"
        }`}
      >
        {expandido ? (
          <span className="truncate text-sm font-semibold text-navy">
            Consultorio Demo
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          aria-label={expandido ? "Colapsar barra lateral" : "Expandir barra lateral"}
          title={expandido ? "Colapsar barra lateral" : "Expandir barra lateral"}
          className="rounded-control p-2 text-navy transition-colors hover:bg-navy-tint hover:text-teal"
        >
          {expandido ? (
            <PanelLeftClose aria-hidden size={20} strokeWidth={1.5} />
          ) : (
            <PanelLeftOpen aria-hidden size={20} strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* `flex-1` empuja el pie (Cerrar sesión) contra el fondo del rail, que
          ahora es el fondo de la ventana. `min-h-0` es lo que permite que esta
          lista ceda espacio en vez de desbordar: sin él, un ítem de flex nunca
          baja de su alto de contenido y en una ventana muy baja el pie volvería
          a salirse.
          Deliberadamente SIN `overflow-y-auto`: en CSS, poner overflow en un
          eje convierte el otro de `visible` en `auto`, y eso recortaría los
          tooltips del estado colapsado, que se dibujan a la derecha del rail
          (`left-full`). Con tres ítems, la lista no llega a desbordar. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        {ITEMS.map(({ href, etiqueta, Icono }) => {
          // `startsWith` y no igualdad: /pacientes/<id> debe seguir marcando
          // "Pacientes" como sección activa.
          const activo = rutaActual === href || rutaActual.startsWith(`${href}/`);
          return (
            <li key={href} className="group relative">
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`flex items-center rounded-control py-2.5 transition-colors ${
                  expandido ? "gap-3 px-3" : "justify-center px-0"
                } ${
                  activo
                    ? // Ítem activo: fondo teal tint + borde izquierdo turquesa
                      // de 3px. El borde se compensa con menos padding para que
                      // el ícono no se desplace al activarse.
                      "border-l-[3px] border-l-teal bg-teal-tint text-teal " +
                      (expandido ? "pl-[9px]" : "pl-0")
                    : "text-navy hover:bg-navy-tint hover:text-teal"
                }`}
              >
                <Icono aria-hidden size={22} strokeWidth={1.5} className="shrink-0" />
                {expandido ? (
                  <span className="truncate text-sm font-medium">{etiqueta}</span>
                ) : (
                  <span className="sr-only">{etiqueta}</span>
                )}
              </Link>

              {/* Tooltip solo en estado colapsado: ahí la etiqueta no se ve y
                  el ícono por sí solo es ambiguo (un estetoscopio puede ser
                  "historial" o "consulta"). En CSS puro, sin librería. */}
              {!expandido ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-1/2 left-full z-10 ml-2 -translate-y-1/2 rounded-control bg-navy px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 shadow-clinica transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {etiqueta}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* `shrink-0`: el pie no cede altura pase lo que pase. Es la salida del
          sistema; que se comprima o desaparezca es justo el fallo que se
          arregló aquí. */}
      <div className="shrink-0 border-t border-borde p-2">
        <form action={cerrarSesion}>
          <button
            type="submit"
            title={expandido ? undefined : "Cerrar sesión"}
            className={`flex w-full items-center rounded-control py-2.5 text-navy transition-colors hover:bg-rojo-tint hover:text-rojo ${
              expandido ? "gap-3 px-3" : "justify-center px-0"
            }`}
          >
            <LogOut aria-hidden size={20} strokeWidth={1.5} className="shrink-0" />
            {expandido ? (
              <span className="text-sm font-medium">Cerrar sesión</span>
            ) : (
              <span className="sr-only">Cerrar sesión</span>
            )}
          </button>
        </form>
      </div>
    </nav>
  );
}
