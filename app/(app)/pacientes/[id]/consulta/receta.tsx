"use client";

import { Plus, Stethoscope, Trash2, User } from "lucide-react";
import {
  ETIQUETA_PRESENTACION,
  ETIQUETA_VIA_ADMINISTRACION,
  PRESENTACIONES,
  VIAS_ADMINISTRACION,
} from "@/lib/pdf/vocabulario";
import {
  medicamentoEstaVacio,
  medicamentoVacio,
  type DatosMedicamento,
  type ErroresReceta,
} from "@/lib/consultas/receta";
import type { Contador } from "@/lib/consultas/formulario";
import type { MedicamentoCatalogoRow } from "@/lib/supabase/tipos";
import { AreaDeTexto, Campo, Desplegable } from "./controles";
import { BuscadorMedicamentos, type BuscarMedicamentos } from "./buscador-medicamentos";

/**
 * La receta dentro de la pantalla de consulta (RF-14 a RF-18).
 *
 * **No es una pantalla aparte**, por lo mismo que el historial: la receta es de
 * una consulta, y las dos se guardan en un solo acto. Separarlas obligaría a
 * decidir qué pasa si se guarda una y no la otra.
 *
 * ## Las dos mitades de la hoja, y por qué se ven en el formulario
 *
 * docs/diseno/Prompts-Stitch.md pide dos columnas, "Rp" y "Prescripción". No es
 * decoración: la hoja física se corta en dos y cada mitad va a un sitio
 * distinto —el "Rp" se queda con la doctora, la "Prescripción" se la lleva el
 * paciente (05-Prescripcion-Receta.md)—, así que cada campo de un medicamento
 * acaba en un papel diferente. Verlo agrupado así al teclear es saber qué va a
 * leer el paciente en su casa y qué queda en el archivo del consultorio.
 *
 * Por eso los campos NO se listan en una fila plana: van en dos grupos
 * rotulados dentro de cada renglón.
 */

export function SeccionReceta({
  medicamentos,
  onMedicamentos,
  signosAlarma,
  recomendaciones,
  onSignosAlarma,
  onRecomendaciones,
  contadorSignos,
  contadorRecomendaciones,
  errores,
  mostrarErrores,
  buscarMedicamentos,
}: {
  medicamentos: DatosMedicamento[];
  onMedicamentos: (medicamentos: DatosMedicamento[]) => void;
  signosAlarma: string;
  recomendaciones: string;
  onSignosAlarma: (valor: string) => void;
  onRecomendaciones: (valor: string) => void;
  contadorSignos: Contador;
  contadorRecomendaciones: Contador;
  errores: ErroresReceta;
  /** Los errores por campo solo se pintan tras intentar guardar. */
  mostrarErrores: boolean;
  buscarMedicamentos: BuscarMedicamentos;
}) {
  const cambiar = (id: string, campo: keyof DatosMedicamento) => (valor: string) =>
    onMedicamentos(
      medicamentos.map((m) => (m.id === id ? { ...m, [campo]: valor } : m))
    );

  const elegirDelCatalogo = (id: string) => (fila: MedicamentoCatalogoRow) =>
    onMedicamentos(
      medicamentos.map((m) =>
        m.id === id
          ? { ...m, nombre_comercial: fila.nombre_comercial, nombre_generico: fila.nombre_generico }
          : m
      )
    );

  const quitar = (id: string) => onMedicamentos(medicamentos.filter((m) => m.id !== id));
  const agregar = () => onMedicamentos([...medicamentos, medicamentoVacio()]);

  /**
   * No se puede apilar un renglón nuevo sobre uno todavía en blanco.
   *
   * No es un tope de medicamentos —ADR-005 es explícito en que no lo hay, porque
   * cuántos caben depende del largo de cada descripción— sino la regla mínima
   * que evita lo que se vio probando: veinte renglones vacíos, ciento sesenta
   * campos en pantalla, y ninguno aportando nada. Son inofensivos para el
   * guardado (se descartan, no cuentan como receta y no queman número), pero
   * convierten el formulario en un muro.
   */
  const ultimoVacio = medicamentos.length > 0 && medicamentoEstaVacio(medicamentos[medicamentos.length - 1]);

  const errorDe = (id: string, campo: keyof DatosMedicamento) =>
    mostrarErrores ? errores.medicamentos[id]?.[campo as never] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {medicamentos.map((medicamento, indice) => (
        <article
          key={medicamento.id}
          // `@container`: lo que sigue se mide contra el ancho de ESTA tarjeta,
          // no contra el de la ventana. Hace falta desde que la receta vive en
          // una columna: con `lg:` —que mira la ventana— las dos mitades de la
          // hoja se ponían lado a lado en una columna de 500px y cada campo
          // quedaba en 90px. Una tarjeta estrecha se apila; una ancha se parte.
          className="@container rounded-tarjeta border border-borde bg-superficie p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-navy">
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-tint text-xs font-semibold text-navy"
              >
                {indice + 1}
              </span>
              Medicamento {indice + 1}
            </h3>
            {medicamentos.length > 1 ? (
              <button
                type="button"
                onClick={() => quitar(medicamento.id)}
                className="flex items-center gap-1.5 rounded-control border border-borde px-2.5 py-1 text-sm text-texto-secundario transition-colors hover:border-rojo hover:text-rojo"
              >
                <Trash2 aria-hidden size={14} strokeWidth={1.5} />
                Quitar
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2">
            {/* --- Mitad Rp: queda con la doctora --- */}
            <MitadDeLaHoja
              titulo="Para la doctora (Rp)"
              nota="Se queda en el archivo del consultorio."
              icono={Stethoscope}
            >
              <BuscadorMedicamentos
                campo={`comercial-${medicamento.id}`}
                valorGenerico={medicamento.nombre_generico}
                valorComercial={medicamento.nombre_comercial}
                onElegir={elegirDelCatalogo(medicamento.id)}
                onEscribirComercial={cambiar(medicamento.id, "nombre_comercial")}
                buscar={buscarMedicamentos}
                error={errorDe(medicamento.id, "nombre_comercial")}
              />
              <Campo
                campo={`generico-${medicamento.id}`}
                etiqueta="Nombre genérico"
                obligatorio
                valor={medicamento.nombre_generico}
                onChange={cambiar(medicamento.id, "nombre_generico")}
                error={errorDe(medicamento.id, "nombre_generico")}
                placeholder="Principio activo"
                ancho="completo"
              />
              <Desplegable
                campo={`presentacion-${medicamento.id}`}
                etiqueta="Presentación"
                obligatorio
                valor={medicamento.presentacion}
                onChange={cambiar(medicamento.id, "presentacion")}
                error={errorDe(medicamento.id, "presentacion")}
                opciones={PRESENTACIONES.map((p) => ({
                  valor: p,
                  etiqueta: ETIQUETA_PRESENTACION[p],
                }))}
              />
              <Campo
                campo={`cantidad-${medicamento.id}`}
                etiqueta="Cantidad"
                obligatorio
                valor={medicamento.cantidad}
                onChange={cambiar(medicamento.id, "cantidad")}
                error={errorDe(medicamento.id, "cantidad")}
                inputMode="numeric"
                mono
                placeholder="1"
              />
            </MitadDeLaHoja>

            {/* --- Mitad Prescripción: se la lleva el paciente --- */}
            <MitadDeLaHoja
              titulo="Para el paciente (Prescripción)"
              nota="Es lo que va a leer en su casa."
              icono={User}
            >
              <Campo
                campo={`dosis-${medicamento.id}`}
                etiqueta="Dosis"
                obligatorio
                valor={medicamento.dosis}
                onChange={cambiar(medicamento.id, "dosis")}
                error={errorDe(medicamento.id, "dosis")}
                placeholder="1 tableta"
              />
              <Desplegable
                campo={`via-${medicamento.id}`}
                etiqueta="Vía"
                obligatorio
                valor={medicamento.via_administracion}
                onChange={cambiar(medicamento.id, "via_administracion")}
                error={errorDe(medicamento.id, "via_administracion")}
                opciones={VIAS_ADMINISTRACION.map((v) => ({
                  valor: v,
                  etiqueta: ETIQUETA_VIA_ADMINISTRACION[v],
                }))}
              />
              <Campo
                campo={`frecuencia-${medicamento.id}`}
                etiqueta="Frecuencia"
                obligatorio
                valor={medicamento.frecuencia}
                onChange={cambiar(medicamento.id, "frecuencia")}
                error={errorDe(medicamento.id, "frecuencia")}
                placeholder="cada 8 horas"
              />
              <Campo
                campo={`duracion-${medicamento.id}`}
                etiqueta="Duración"
                obligatorio
                valor={medicamento.duracion}
                onChange={cambiar(medicamento.id, "duracion")}
                error={errorDe(medicamento.id, "duracion")}
                placeholder="7 días"
              />
            </MitadDeLaHoja>
          </div>
        </article>
      ))}

      <div>
        <button
          type="button"
          onClick={agregar}
          disabled={ultimoVacio}
          title={ultimoVacio ? "Llena el renglón que ya tienes abierto" : undefined}
          className="flex items-center gap-2 rounded-control border border-navy px-3 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy-tint hover:text-teal disabled:cursor-not-allowed disabled:border-borde disabled:text-texto-secundario disabled:hover:bg-transparent"
        >
          <Plus aria-hidden size={16} strokeWidth={1.5} />
          Agregar medicamento
        </button>
        {/* Cuántos caben no es un número fijo: depende del largo de cada
            descripción, y lo decide `indicacionesCabenEnReceta` (ADR-005). */}
        {errores.lista ? (
          <p role="alert" className="mt-3 rounded-control bg-rojo-tint px-3 py-2 text-sm text-rojo">
            {errores.lista}
          </p>
        ) : (
          <p className="mt-2 text-sm text-texto-secundario">
            {ultimoVacio
              ? "Llena el renglón que ya tienes abierto para poder agregar otro."
              : "No hay un tope fijo de medicamentos: el sistema avisa cuando la lista deja de caber en el espacio impreso de la receta."}
          </p>
        )}
      </div>

      {/* Los dos textos largos que se lleva el paciente. Van al final porque
          valen para la receta entera, no para un medicamento suelto. */}
      <div className="mt-2 grid grid-cols-1 gap-6 rounded-tarjeta border border-borde bg-navy-tint p-4 sm:p-5">
        <p className="text-[13px] font-semibold tracking-[0.05em] text-texto-secundario">
          PARA EL PACIENTE, EN TODA LA RECETA
        </p>
        <AreaDeTexto
          campo="signos_alarma"
          etiqueta="Signos de alarma"
          valor={signosAlarma}
          onChange={onSignosAlarma}
          error={mostrarErrores ? errores.signos_alarma : undefined}
          filas={2}
          contador={contadorSignos}
          placeholder="Ej. Fiebre que no cede en 48 h, dificultad para respirar."
        />
        <AreaDeTexto
          campo="recomendaciones_no_farmacologicas"
          etiqueta="Recomendaciones no farmacológicas"
          valor={recomendaciones}
          onChange={onRecomendaciones}
          error={mostrarErrores ? errores.recomendaciones_no_farmacologicas : undefined}
          filas={3}
          contador={contadorRecomendaciones}
          placeholder="Ej. Reposo relativo, abundantes líquidos, control en 72 h."
        />
      </div>
    </div>
  );
}

/** Uno de los dos grupos de campos de un medicamento, con su rótulo. */
function MitadDeLaHoja({
  titulo,
  nota,
  icono: Icono,
  children,
}: {
  titulo: string;
  nota: string;
  icono: typeof Stethoscope;
  children: React.ReactNode;
}) {
  return (
    <section className="@container flex flex-col gap-4 rounded-control border border-borde p-4">
      <header>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Icono aria-hidden size={16} strokeWidth={1.5} />
          {titulo}
        </h4>
        <p className="mt-0.5 text-xs text-texto-secundario">{nota}</p>
      </header>
      {/* Igual que arriba, un nivel más adentro: los campos se ponen en dos
          por fila solo si la mitad de la hoja tiene sitio de verdad. */}
      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">{children}</div>
    </section>
  );
}
