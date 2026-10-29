"use client";

import { useState } from "react";
import { aLineaUnica, traeSaltosDeLinea } from "@/lib/texto-plano";

/**
 * Comportamiento de un campo de texto largo **que acaba impreso en una
 * plantilla física**: no admite saltos de línea.
 *
 * ## Por qué no los admite
 *
 * Estos campos son prosa que se ajusta sola al ancho de la hoja. Quien decide
 * dónde corta cada renglón es `wrapText`, y de ahí sale la cuenta de cuántas
 * líneas caben: dos para "Impresión Diagnóstica", tres para "Tratamiento"
 * (ADR-007), dos y tres para "Signos de alarma" y "Recomendaciones no
 * Farmacológicas" (ADR-005). Un salto de línea puesto a mano no es una
 * preferencia de estilo: le roba un renglón a un espacio que ya está medido al
 * punto, y el texto que sobra no se ve al imprimir.
 *
 * **Ningún campo del sistema se imprime como lista.** Se revisaron los siete que
 * llegan a una plantilla —los cuatro antecedentes patológicos, motivo, impresión
 * diagnóstica y tratamiento, más los antecedentes heredofamiliares de la ficha y
 * los dos de la receta— y todos salen como texto corrido a través de `wrapText`,
 * que corta por espacios. Ninguno gana nada con un salto manual, y todos pierden
 * lo mismo.
 *
 * ## Lo que esto arregla
 *
 * Un **Shift+Enter** metía un `\n` de verdad. `pdf-lib` codifica en WinAnsi y
 * lanza ante ese carácter desde `font.widthOfTextAtSize()`, o sea desde
 * `wrapText`, que es lo que llama el contador en vivo **en cada tecla**: la
 * pantalla se caía con un Runtime Error completo antes de que hubiera nada que
 * validar. El **pegado desde Word** hace lo mismo con `\r\n` y con tabuladores,
 * y ahí no hay ninguna tecla que interceptar — por eso el saneado va en el
 * `onChange` y no solo en el `onKeyDown`.
 *
 * La red de seguridad está además en `lib/pdf/text.ts`, que sanea todo lo que
 * llega a pdf-lib venga de donde venga. Esto es la otra capa: que el dato no se
 * ensucie en el origen, y que la doctora vea POR QUÉ la tecla no hace nada.
 *
 * > El nombre está en inglés —`useTextoPlano`, no `usarTextoPlano`— y es la
 * > única concesión de este tipo en el repositorio: la regla `rules-of-hooks`
 * > de ESLint reconoce un hook por el prefijo `use`, y con el nombre en
 * > castellano rechaza la llamada a `useState` de dentro. Es una restricción de
 * > la herramienta, no una preferencia.
 */

/** Lo que se le dice a quien acaba de pulsar Enter, o de pegar un párrafo. */
export const AVISO_SIN_SALTOS =
  "Este campo se imprime en renglones de ancho fijo, así que no admite saltos de línea: el texto se ajusta solo.";

export interface TextoPlano {
  /** `true` justo después de quitar un salto. Se apaga al seguir escribiendo. */
  avisoSalto: boolean;
  /** Para el `<textarea>`. Sustituye a su `onChange`/`onKeyDown`. */
  manejadores: {
    onChange: (evento: { target: { value: string } }) => void;
    onKeyDown: (evento: { key: string; preventDefault: () => void }) => void;
  };
}

export function useTextoPlano(onChange: (valor: string) => void): TextoPlano {
  const [avisoSalto, setAvisoSalto] = useState(false);

  return {
    avisoSalto,
    manejadores: {
      onChange: (evento) => {
        const bruto = evento.target.value;
        // El aviso solo aparece cuando de verdad había algo que quitar —o sea,
        // al pegar—, y desaparece en cuanto se sigue escribiendo con normalidad.
        setAvisoSalto(traeSaltosDeLinea(bruto));
        onChange(aLineaUnica(bruto));
      },
      onKeyDown: (evento) => {
        if (evento.key !== "Enter") return;
        // Enter y Shift+Enter hacen lo mismo dentro de un `<textarea>`: meter un
        // salto. Se frenan los dos. Aquí no hay nada que enviar —el `<form>` no
        // se envía con Enter desde un área de texto—, así que no se pierde
        // ningún atajo.
        evento.preventDefault();
        setAvisoSalto(true);
      },
    },
  };
}
