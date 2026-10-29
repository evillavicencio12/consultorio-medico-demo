import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsultaRow, Database, RecetaMedicamentoRow } from "@/lib/supabase/tipos";

/**
 * Lectura de las consultas de un paciente, para la línea de tiempo (RF-20) y
 * para los PDF que cuelgan de ella (RF-19).
 *
 * Recibe el cliente en vez de crearlo, igual que `lib/pacientes/consulta.ts`:
 * así la pantalla decide con cuál corre —hoy `lib/supabase/server.ts`, con la
 * sesión de la doctora y RLS aplicando— y este archivo no puede acabar
 * importando `admin.ts` por descuido.
 */

/**
 * Se traen TODAS las columnas de la consulta, no un subconjunto como en el
 * listado de pacientes. No es descuido: el PDF del historial se genera **en el
 * navegador** (pdf-lib carga la plantilla desde `/templates` por fetch), así
 * que el navegador necesita la fila entera. Recortar columnas aquí obligaría a
 * un segundo viaje al servidor justo cuando la doctora pulsa "ver PDF".
 */
export type ConsultaDePaciente = ConsultaRow;

export interface HistorialDePaciente {
  /** De la más reciente a la más antigua. Ver la nota de `listarConsultas`. */
  consultas: ConsultaDePaciente[];
  /**
   * Medicamentos de todas esas consultas, agrupados por `consulta_id`.
   *
   * Se traen por adelantado, en la misma carga de la pantalla, en lugar de
   * pedirlos cuando se abre la vista previa de una receta. Con los volúmenes
   * reales de este consultorio —una decena o dos de consultas por paciente, y
   * como mucho siete medicamentos por receta (ADR-005)— son unos pocos KB, y a
   * cambio la pantalla puede hacer dos cosas que si no serían imposibles:
   * saber si una consulta tiene receta ANTES de ofrecer el botón, y abrir el
   * PDF sin un viaje al servidor de por medio.
   */
  medicamentos: Map<string, RecetaMedicamentoRow[]>;
  /**
   * Fecha de la consulta más antigua: la "Fecha de Elaboración" que imprime el
   * PDF del historial (03-Historial-Clinico.md).
   *
   * Se calcula aquí, con todas las consultas a la vista, y NO se usa
   * `paciente.created_at`: para los 164 importados en bloque desde el Sheet
   * (RF-02) esa fecha es el día de la migración, no una fecha clínica.
   * `null` cuando el paciente todavía no tiene ninguna consulta.
   */
  fechaPrimeraConsulta: string | null;
}

/**
 * Trae el historial completo de un paciente.
 *
 * **Orden: de la más reciente a la más antigua.** RF-20 pide "cronológicamente"
 * sin decir en qué sentido, y descendente es el que sirve: la ficha se abre
 * para ver qué pasó la última vez, no para leer el expediente desde el
 * principio. La consulta más antigua sigue siendo localizable —es la última de
 * la lista— y de ella sale la "Fecha de Elaboración" del PDF.
 *
 * Desempate por `created_at`: `fecha` es un `date` sin hora, así que dos
 * consultas del mismo día quedarían en orden indefinido y la línea de tiempo
 * "parpadearía" entre recargas.
 */
export async function listarConsultas(
  supabase: SupabaseClient<Database>,
  pacienteId: string
): Promise<HistorialDePaciente> {
  const { data, error } = await supabase
    .from("consultas")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  const consultas = (data ?? []) as ConsultaDePaciente[];

  const medicamentos = new Map<string, RecetaMedicamentoRow[]>();
  if (consultas.length > 0) {
    const { data: filas, error: errorMedicamentos } = await supabase
      .from("receta_medicamentos")
      .select("*")
      .in(
        "consulta_id",
        consultas.map((c) => c.id)
      );

    if (errorMedicamentos) throw errorMedicamentos;

    for (const fila of (filas ?? []) as RecetaMedicamentoRow[]) {
      const lista = medicamentos.get(fila.consulta_id);
      if (lista) lista.push(fila);
      else medicamentos.set(fila.consulta_id, [fila]);
    }
  }

  return {
    consultas,
    medicamentos,
    // Las consultas vienen en orden descendente, así que la más antigua es la
    // última. Se lee de ahí en vez de recorrer buscando el mínimo: el orden ya
    // lo puso Postgres.
    fechaPrimeraConsulta: consultas.length > 0 ? consultas[consultas.length - 1].fecha : null,
  };
}
