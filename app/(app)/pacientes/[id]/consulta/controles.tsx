"use client";

import { AlertCircle } from "lucide-react";
import type { Contador } from "@/lib/consultas/formulario";
import { AVISO_SIN_SALTOS, useTextoPlano } from "../../../use-texto-plano";

/**
 * Los controles del formulario de consulta, compartidos entre el historial y la
 * receta.
 *
 * Vivían dentro de `formulario-consulta.tsx` hasta que la receta necesitó los
 * mismos. Copiarlos habría sido barato y peligroso: `AreaDeTexto` es lo que
 * engancha `useTextoPlano`, y una segunda copia que se olvidara de él devolvería
 * el fallo que la Sesión A cerró —un Shift+Enter tumbaba la aplicación—. Con un
 * solo `<textarea>` en todo el sistema, eso no puede volver por descuido.
 *
 * `campo` es `string` y no el tipo de un campo concreto: aquí sirve de `id` y de
 * `name` del control, y lo usan tanto los campos de la consulta como los de cada
 * renglón de medicamento. Quién puede pasar qué lo decide el que llama.
 */

export const BASE_CONTROL =
  "w-full rounded-control border bg-superficie px-3 py-2.5 text-[15px] text-navy " +
  "transition-colors focus:outline-none";

/**
 * Chevron de Lucide embebido como data-URI. No es un icono de otra librería: es
 * el mismo trazo de 1.5px del sistema, en línea porque un `<select>` no admite
 * hijos que no sean `<option>`. Vive aquí para que todos los desplegables del
 * sistema acaben con la misma flecha.
 */
export const CLASES_DESPLEGABLE =
  "appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10";

export const ESTILO_CHEVRON: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%235b7185' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

export function bordeDe(error: string | undefined, valido = false): string {
  if (error) return "border-rojo focus:border-rojo";
  if (valido) return "border-teal focus:border-teal";
  return "border-borde focus:border-navy";
}

/** Sistema-de-Diseno.md: la etiqueta va SIEMPRE visible sobre el campo. */
export function Etiqueta({
  campo,
  etiqueta,
  obligatorio,
  sufijo,
}: {
  campo: string;
  etiqueta: string;
  obligatorio?: boolean;
  sufijo?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={campo}
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px] font-semibold tracking-[0.05em] text-navy"
    >
      <span>
        {etiqueta.toUpperCase()}
        {obligatorio ? <span className="ml-1 text-rojo">*</span> : null}
      </span>
      {sufijo}
    </label>
  );
}

export function MensajeError({ campo, error }: { campo: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <p id={`${campo}-error`} className="flex items-start gap-1.5 text-sm text-rojo">
      <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} />
      {error}
    </p>
  );
}

/** Lo que puede salir mal en un buscador de catálogo. */
export type FalloCatalogo = {
  texto: string;
  /**
   * La sesión caducó (la acción lo devolvió): guardar también va a fallar, así
   * que es un error, no el aviso gris de "catálogo caído" con el que se sigue.
   */
  bloquea: boolean;
};

/**
 * El aviso bajo un buscador de catálogo (CIE-10 y medicamentos).
 *
 * El `key` no es decorativo: si el aviso gris ya estaba en pantalla y luego
 * caduca la sesión, React reutilizaría el mismo `<p>` y solo le añadiría
 * `role="alert"`; los lectores de pantalla no suelen anunciar un rol añadido a
 * un nodo existente. Con otro `key` el nodo se monta de nuevo y se anuncia.
 */
export function AvisoCatalogo({ fallo }: { fallo: FalloCatalogo | null }) {
  if (!fallo) return null;
  return (
    <p
      key={fallo.bloquea ? "sesion" : "catalogo"}
      role={fallo.bloquea ? "alert" : undefined}
      className={`flex items-start gap-1.5 text-sm ${fallo.bloquea ? "font-semibold text-rojo" : "text-texto-secundario"}`}
    >
      <AlertCircle aria-hidden className="mt-0.5 shrink-0" size={14} strokeWidth={1.5} />
      {fallo.texto}
    </p>
  );
}

/**
 * El contador de ADR-005 y ADR-007, visible mientras se escribe.
 *
 * Cambia a rojo exactamente cuando el guardado se bloquea: `excedido` no es
 * "usados > maximo" sino el veredicto de la función de ajuste, que mide con las
 * métricas de la fuente. Por eso el número lleva "aprox." — es una orientación,
 * no el juez.
 */
export function ContadorCaracteres({ contador, nota }: { contador: Contador; nota?: string }) {
  return (
    <span
      className={`identificador text-[11px] font-medium tracking-normal ${
        contador.excedido ? "text-rojo" : "text-texto-secundario"
      }`}
    >
      {contador.usados}/{contador.maximo} aprox.
      {nota ? <span className="ml-1 font-sans">({nota})</span> : null}
    </span>
  );
}

export function Campo({
  campo,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  aviso,
  obligatorio,
  placeholder,
  mono = false,
  inputMode,
  ancho = "medio",
}: {
  campo: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  error?: string;
  aviso?: string;
  obligatorio?: boolean;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
  ancho?: "medio" | "completo";
}) {
  return (
    <div className={`flex flex-col gap-2 ${ancho === "completo" ? "sm:col-span-2" : ""}`}>
      <Etiqueta campo={campo} etiqueta={etiqueta} obligatorio={obligatorio} />
      <input
        id={campo}
        name={campo}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${campo}-error` : undefined}
        className={`${BASE_CONTROL} ${bordeDe(error)} ${mono ? "identificador" : ""}`}
      />
      <MensajeError campo={campo} error={error} />
      {!error && aviso ? <p className="text-sm text-texto-secundario">{aviso}</p> : null}
    </div>
  );
}

/**
 * Un signo vital: número a la izquierda, unidad impresa a la derecha del campo.
 *
 * **La unidad se muestra pero no se teclea.** La base guarda `numeric` y el PDF
 * pega la unidad al imprimir (06-Generador-PDF.md); un "65 kg" escrito aquí es
 * un valor que Postgres rechaza.
 *
 * Es `type="text"` con `inputMode="decimal"` y no `type="number"`: con la coma
 * decimal que se usa aquí ("36,5"), un campo numérico se queda con la cadena
 * vacía según el locale del navegador y el dato se pierde sin avisar.
 */
export function Medicion({
  campo,
  etiqueta,
  unidad,
  valor,
  onChange,
  onBlur,
  error,
  aviso,
  placeholder,
}: {
  campo: string;
  etiqueta: string;
  unidad: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur: () => void;
  error?: string;
  aviso?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Etiqueta campo={campo} etiqueta={etiqueta} />
      <div className="relative">
        <input
          id={campo}
          name={campo}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${campo}-error` : undefined}
          className={`identificador ${BASE_CONTROL} pr-14 ${bordeDe(error)}`}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-texto-secundario"
        >
          {unidad}
        </span>
      </div>
      <MensajeError campo={campo} error={error} />
      {!error && aviso ? <p className="text-sm text-texto-secundario">{aviso}</p> : null}
    </div>
  );
}

/**
 * Desplegable de vocabulario cerrado.
 *
 * Se guarda el `valor` (el slug estable, `solucion_inyectable`) y se muestra la
 * `etiqueta` legible ("solución inyectable"): es la misma regla que el PDF sigue
 * al imprimir, y la razón por la que estas listas son tipos unión y no texto
 * libre — ver `lib/pdf/vocabulario.ts`.
 */
export function Desplegable({
  campo,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  obligatorio,
  opciones,
  vacio = "Seleccionar…",
}: {
  campo: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  error?: string;
  obligatorio?: boolean;
  opciones: { valor: string; etiqueta: string }[];
  vacio?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Etiqueta campo={campo} etiqueta={etiqueta} obligatorio={obligatorio} />
      <select
        id={campo}
        name={campo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${campo}-error` : undefined}
        className={`${BASE_CONTROL} ${bordeDe(error, Boolean(valor))} ${CLASES_DESPLEGABLE}`}
        style={ESTILO_CHEVRON}
      >
        <option value="">{vacio}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
      <MensajeError campo={campo} error={error} />
    </div>
  );
}

/**
 * Texto largo que acaba impreso en una plantilla física.
 *
 * **No admite saltos de línea**, y no es cosmético: quien decide dónde corta
 * cada renglón es `wrapText`, y de ahí sale la cuenta de cuántas líneas caben
 * (ADR-005 y ADR-007). Un salto a mano le roba un renglón a un espacio medido al
 * punto — y hasta la Sesión A tumbaba la aplicación entera, porque pdf-lib lanza
 * ante un `\n` y el contador mide en cada tecla. El porqué completo está en
 * `useTextoPlano`.
 */
export function AreaDeTexto({
  campo,
  etiqueta,
  valor,
  onChange,
  onBlur,
  error,
  obligatorio,
  filas = 3,
  placeholder,
  contador,
  notaContador,
  ancho = "completo",
}: {
  campo: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  error?: string;
  obligatorio?: boolean;
  filas?: number;
  placeholder?: string;
  contador?: Contador;
  notaContador?: string;
  ancho?: "medio" | "completo";
}) {
  const { avisoSalto, manejadores } = useTextoPlano(onChange);

  return (
    <div className={`flex flex-col gap-2 ${ancho === "completo" ? "sm:col-span-2" : ""}`}>
      <Etiqueta
        campo={campo}
        etiqueta={etiqueta}
        obligatorio={obligatorio}
        sufijo={contador ? <ContadorCaracteres contador={contador} nota={notaContador} /> : undefined}
      />
      <textarea
        id={campo}
        name={campo}
        value={valor}
        onChange={manejadores.onChange}
        onKeyDown={manejadores.onKeyDown}
        onBlur={onBlur}
        rows={filas}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${campo}-error` : undefined}
        className={`${BASE_CONTROL} ${bordeDe(error)} resize-y`}
      />
      <MensajeError campo={campo} error={error} />
      {/* `role="status"`: la tecla no hizo nada y hay que decir por qué, pero no
          es un error — no se pierde nada de lo escrito. */}
      {avisoSalto ? (
        <p role="status" className="text-sm text-texto-secundario">
          {AVISO_SIN_SALTOS}
        </p>
      ) : null}
    </div>
  );
}
