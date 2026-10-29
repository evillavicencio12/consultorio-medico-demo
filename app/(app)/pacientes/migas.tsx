import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Breadcrumb "Pacientes / …", el patrón de navegación que pide
 * Sistema-de-Diseno.md.
 *
 * Con tres niveles (listado → ficha → editar) hace falta algo que diga dónde se
 * está y permita subir un escalón sin pasar por el rail: desde "Editar" se
 * vuelve a la ficha, no al listado, que es a donde llevaría el botón "atrás" de
 * la barra lateral.
 *
 * El último tramo va en gris y sin enlace — un enlace a la página en la que ya
 * estás no lleva a ninguna parte.
 */
export function Migas({
  intermedio,
  actual,
}: {
  /** Tramo opcional entre "Pacientes" y el actual: la ficha del paciente. */
  intermedio?: { etiqueta: string; href: string };
  actual: string;
}) {
  return (
    <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/pacientes"
        className="font-medium text-navy transition-colors hover:text-teal"
      >
        Pacientes
      </Link>

      {intermedio ? (
        <>
          <ChevronRight aria-hidden className="shrink-0 text-borde" size={14} strokeWidth={1.5} />
          <Link
            href={intermedio.href}
            className="max-w-[16rem] truncate font-medium text-navy transition-colors hover:text-teal"
          >
            {intermedio.etiqueta}
          </Link>
        </>
      ) : null}

      <ChevronRight aria-hidden className="shrink-0 text-borde" size={14} strokeWidth={1.5} />
      <span aria-current="page" className="truncate text-texto-secundario">
        {actual}
      </span>
    </nav>
  );
}
