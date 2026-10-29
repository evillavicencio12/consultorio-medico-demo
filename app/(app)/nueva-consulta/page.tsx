import { redirect } from "next/navigation";
import { PARAM_PARA, PARA_CONSULTA } from "@/lib/pacientes/busqueda";

/**
 * `/nueva-consulta` no es una pantalla: es el ítem del rail, y lo que hace es
 * llevar al listado en modo "elige a quién atender".
 *
 * Desde la Fase 4 el formulario de consulta cuelga de un paciente
 * (`/pacientes/[id]/consulta`), porque su cabecera son los datos fijos de ese
 * paciente. Una pantalla intermedia sin paciente solo podría preguntar cuál, y
 * eso ya es `/pacientes`: con buscador por nombre y por documento, con el
 * filtro de fichas incompletas y con el alta. Construir otra sería la "segunda
 * puerta a la misma sala, peor equipada" que docs/modulos/03-Historial-Clinico.md ya
 * descartó cuando se quitó el ítem "Historial Clínico" del rail.
 *
 * La diferencia con `/historial` —que redirige a secas— es el parámetro: aquí
 * no se pierde para qué se venía. Con `?para=consulta`, cada fila del listado
 * abre directamente la consulta nueva de ese paciente en vez de su ficha, así
 * que el ítem del rail sigue costando los mismos dos clics que costaría una
 * pantalla propia.
 */
export default function PaginaNuevaConsulta() {
  redirect(`/pacientes?${PARAM_PARA}=${PARA_CONSULTA}`);
}
