import { redirect } from "next/navigation";

/**
 * `/historial` ya no es una pantalla.
 *
 * En la Fase 1 existía como ítem del rail, siguiendo docs/diseno/Prompts-Stitch.md.
 * Al construir la línea de tiempo (Fase 3) se resolvió el conflicto que ese
 * archivo tenía con la definición del proyecto —"Historial Clínico se abre al
 * seleccionar un paciente, no es un ítem de menú aparte"— a favor de la
 * segunda: el historial clínico de un paciente es su ficha, `/pacientes/[id]`.
 * El razonamiento completo está en docs/modulos/03-Historial-Clinico.md.
 *
 * Se redirige en vez de devolver 404 porque la ruta llegó a existir: cualquier
 * marcador o enlace viejo aterriza en el sitio del que ahora cuelga el
 * historial, en lugar de en una pantalla de error.
 */
export default function PaginaHistorial() {
  redirect("/pacientes");
}
