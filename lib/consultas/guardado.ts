import type { ConsultaRow, Database, RecetaMedicamentoRow } from "@/lib/supabase/tipos";
import type { DatosConsulta } from "./formulario";
import { aCantidad, medicamentosParaGuardar, type DatosMedicamento } from "./receta";

/**
 * Cómo se convierten los datos del formulario en las filas que se insertan.
 *
 * Está separado de la Server Action, y sin Supabase, por una razón concreta:
 * aquí vive la decisión más delicada de toda la Fase 4 —cuándo se consume un
 * número del correlativo— y tiene que poder comprobarse sin tocar la base.
 */

type FilaConsulta = Database["public"]["Tables"]["consultas"]["Insert"];
type FilaMedicamento = Database["public"]["Tables"]["receta_medicamentos"]["Insert"];

/** Texto vacío a `null`: la base guarda NULL, no cadenas vacías. */
function oNulo(texto: string): string | null {
  const limpio = texto.trim();
  return limpio ? limpio : null;
}

function oNumero(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!limpio || !/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

/**
 * La fila de `consultas`, con la regla del correlativo (ADR-002).
 *
 * **Es el único sitio del sistema que decide si se consume un número de
 * receta**, y la decisión se toma mirando una sola cosa: si hay medicamentos.
 *
 *   * Con medicamentos → la clave `numero_receta` **no se incluye**. Al omitirla,
 *     Postgres aplica el DEFAULT `nextval('numero_receta_seq')` y asigna el
 *     siguiente número, de forma atómica y sin un viaje extra a pedirlo.
 *   * Sin medicamentos → se manda `numero_receta: null` explícito. Un DEFAULT
 *     solo actúa cuando la columna se omite, así que mandar null es justamente
 *     lo que impide que la secuencia avance.
 *
 * La diferencia entre "omitir la clave" y "mandar null" es invisible al leer el
 * código deprisa y decide si un número del talonario se quema o no. Por eso
 * está aquí sola, con nombre propio y con prueba: ver
 * `tests/receta.test.ts`.
 */
export function filaConsulta(
  pacienteId: string,
  datos: DatosConsulta,
  medicamentos: DatosMedicamento[]
): FilaConsulta {
  const fila: FilaConsulta = {
    paciente_id: pacienteId,
    fecha: datos.fecha,
    motivo_consulta: oNulo(datos.motivo_consulta),
    alergias: oNulo(datos.alergias),
    patologias: oNulo(datos.patologias),
    quirurgicos: oNulo(datos.quirurgicos),
    transfusionales: oNulo(datos.transfusionales),
    pa: oNulo(datos.pa),
    fc: oNumero(datos.fc),
    fr: oNumero(datos.fr),
    temperatura: oNumero(datos.temperatura),
    peso: oNumero(datos.peso),
    impresion_diagnostica: oNulo(datos.impresion_diagnostica),
    cie10_codigo: oNulo(datos.cie10_codigo),
    tratamiento: oNulo(datos.tratamiento),
    signos_alarma: oNulo(datos.signos_alarma),
    recomendaciones_no_farmacologicas: oNulo(datos.recomendaciones_no_farmacologicas),
  };

  // Sin receta, la consulta se guarda con el número en NULL y el correlativo no
  // se mueve (ver 20260822120000_numero_receta_opcional.sql).
  if (medicamentosParaGuardar(medicamentos).length === 0) {
    return { ...fila, numero_receta: null };
  }

  // Con receta, la clave se omite a propósito para que dispare el DEFAULT.
  return fila;
}

/** Las filas de `receta_medicamentos` de una consulta ya insertada. */
export function filasMedicamentos(
  consultaId: string,
  medicamentos: DatosMedicamento[]
): FilaMedicamento[] {
  return medicamentosParaGuardar(medicamentos).map((m) => ({
    consulta_id: consultaId,
    nombre_generico: m.nombre_generico.trim(),
    nombre_comercial: m.nombre_comercial.trim(),
    // El `as` se apoya en que la validación ya exigió elegir del vocabulario
    // cerrado; si no lo hubiera hecho, el CHECK de la base lo rechazaría igual.
    presentacion: m.presentacion as FilaMedicamento["presentacion"],
    via_administracion: m.via_administracion as FilaMedicamento["via_administracion"],
    cantidad: aCantidad(m.cantidad) ?? 0,
    dosis: m.dosis.trim(),
    frecuencia: m.frecuencia.trim(),
    duracion: m.duracion.trim(),
  }));
}

/**
 * Lo que devuelve el guardado.
 *
 * Vive aquí y no en `./acciones` porque aquel archivo lleva `"use server"`, y
 * de un módulo así solo deben salir funciones asíncronas.
 */
export interface ResultadoGuardado {
  ok: boolean;
  mensaje?: string;
  /** La fila tal como quedó en la base, con su `numero_receta` de verdad. */
  consulta?: ConsultaRow;
  medicamentos?: RecetaMedicamentoRow[];
}
