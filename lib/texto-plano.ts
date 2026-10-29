/**
 * Texto libre → texto que una plantilla física puede imprimir.
 *
 * ## Por qué existe
 *
 * `pdf-lib` codifica con **WinAnsi** y **lanza** ante cualquier carácter que esa
 * codificación no tenga. No devuelve un cuadrito ni un espacio: tira la
 * excepción `WinAnsi cannot encode "\n" (0x000a)` desde
 * `font.widthOfTextAtSize()`, o sea desde `wrapText`, que es la primera cosa que
 * toca el texto.
 *
 * Eso convierte un carácter tecleado en una caída de la aplicación entera:
 *
 *   - Un **Shift+Enter** en "Tratamiento" mete un `\n` real. El contador en vivo
 *     llama a `tratamientoCabeEnHistorial()` en cada tecla → `wrapText` →
 *     excepción **durante el render**, o sea Runtime Error en pantalla, no un
 *     mensaje de validación.
 *   - Un **copiar y pegar desde Word** trae `\r\n`, tabuladores, a veces
 *     `U+2028`, y ninguna tecla lo delata.
 *
 * ## Dos funciones, dos capas
 *
 * `aLineaUnica` es la del FORMULARIO: solo toca espacios en blanco, así que no
 * pierde nada de lo escrito y se puede aplicar en cada pulsación sin sorprender
 * a quien teclea.
 *
 * `aTextoImprimible` es la de `lib/pdf/text.ts`: la red de seguridad. Además de
 * los saltos, traduce los símbolos que la hoja no puede imprimir y sustituye lo
 * que quede por `?`. Su contrato es simple y absoluto: **nada de lo que salga de
 * aquí puede hacer lanzar a pdf-lib**.
 *
 * Este archivo no importa pdf-lib a propósito: lo usan los formularios, y
 * arrastrar el módulo de PDF al bundle de la ficha de paciente por una función
 * de cadenas sería caro para nada.
 */

/**
 * Todo salto de línea —y el espacio en blanco que lo rodea— se convierte en UN
 * espacio.
 *
 * Un espacio, y no cadena vacía: `wrapText` corta por espacios, así que sin él
 * "Amoxicilina 500 mg.\nParacetamol" se imprimiría como "…mg.Paracetamol",
 * pegando dos frases en una palabra que además ya no cabría donde debía.
 *
 * Cubre `\n`, `\r\n`, `\r`, el tabulador y los dos separadores Unicode que
 * traen algunos pegados de Word (`U+2028` línea, `U+2029` párrafo).
 *
 * NO colapsa los espacios dobles que alguien escriba a mano ni recorta los
 * extremos: esta función corre mientras se teclea, y un campo que se come el
 * espacio recién pulsado es un campo roto.
 *
 * Lo que sí hace además de los espacios: componer los acentos (NFC) y quitar
 * los caracteres INVISIBLES que viajan en un pegado. Las dos cosas son
 * reversibles a la vista —nadie ve un espacio de ancho cero ni distingue una
 * `í` compuesta de una descompuesta— y las dos ensuciaban el contador o el
 * papel. Traducir símbolos, en cambio, NO se hace aquí: eso cambiaría lo que la
 * doctora escribió, y es cosa de `aTextoImprimible`, que corre al imprimir.
 */
export function aLineaUnica(texto: string): string {
  return (
    texto
      // NFC: compone los acentos. Un pegado desde macOS o desde Word trae la
      // "í" como `i` + \u0301 y la "ñ" como `n` + \u0303. Se ve bien en
      // pantalla, pero son DOS caracteres: el contador de ADR-007 cuenta el
      // doble en cada palabra acentuada, y lo que se guarda en la base queda
      // descompuesto. Componer no pierde nada —es la misma letra— y deja el
      // campo contando lo mismo que se va a imprimir.
      .normalize("NFC")
      // El espacio alrededor del salto se absorbe para no dejar huecos dobles.
      .replace(/[ \t]*[\r\n\u2028\u2029]+[ \t]*/g, " ")
      // Un tabulador suelto es una sangría que la hoja impresa no tiene.
      .replace(/\t/g, " ")
      // El resto de caracteres de control no se ve, no se puede codificar, y
      // solo puede haber llegado pegado desde otro programa.
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      // Los pasajeros INVISIBLES de un pegado: espacios de ancho cero, marca de
      // orden de bytes, juntadores, selectores de variación y el guion suave de
      // Word. No se ven en el campo, pero cuentan para el contador de caracteres
      // y llegan al PDF — donde el guion suave se dibuja como un guion de verdad
      // ("anti-inflamatorio") y el resto acaba en un `?` bien visible. Un
      // carácter que no se ve no puede ensuciar un papel.
      .replace(/[\u00ad\u200b-\u200f\u2060-\u2064\ufe00-\ufe0f\ufeff]/g, "")
  );
}

/** `true` si `aLineaUnica` tendría algo que quitar. Para avisar en el formulario. */
export function traeSaltosDeLinea(texto: string): boolean {
  return aLineaUnica(texto) !== texto;
}

/**
 * Los símbolos que WinAnsi no tiene y que sí aparecen en prosa clínica.
 *
 * Se traducen en lugar de borrarse porque **significan algo**: "fiebre ≥ 38" sin
 * el signo es una indicación distinta, y en una receta eso lo ejecuta un
 * farmacéutico. La forma ASCII (">= 38") es la que se escribía a máquina antes
 * de que existieran estos caracteres, así que se lee sin aprender nada.
 *
 * Lo que NO está aquí es porque WinAnsi sí lo tiene y se imprime tal cual:
 * `°` `±` `µ` `×` `÷` `–` `—` `«»` `“”` `‘’` `…` `²` `³` `½`. Comprobado uno a
 * uno contra pdf-lib en `tests/texto-plano.test.ts`.
 */
const TRADUCCIONES: Record<string, string> = {
  // La familia del "mayor o igual" ENTERA, no solo el símbolo matemático
  // estándar. Word, los teclados japoneses y los editores de fórmulas producen
  // primos visuales suyos —\u2267 y \u2A7E se ven casi idénticos a \u2265— y sin
  // esta lista caían todos en el `?`: "volver si fiebre ? 38" impreso en una
  // receta. Se encontraron comparando puntos de código, no de vista.
  "\u2265": ">=", // mayor o igual
  "\u2267": ">=", // idem, trazo doble
  "\u2A7E": ">=", // idem, trazo inclinado
  "\u2264": "<=", // menor o igual
  "\u2266": "<=", // idem, trazo doble
  "\u2A7D": "<=", // idem, trazo inclinado
  // Las formas NEGADAS tienen que decir que lo son. Llegan casi siempre como
  // \u2265 seguido de la barra combinable \u0338, que `aTextoImprimible` compone a
  // NFC antes de mirar esta tabla: sin ese paso, la barra —o sea, justo lo que
  // invierte el significado— se perdía en un `?` suelto, y "no mayor o igual"
  // se imprimía como ">=?".
  "\u2271": "no >=",
  "\u2270": "no <=",
  "\u226F": "no >",
  "\u226E": "no <",
  "≠": "!=",
  "≈": "~",
  "→": "->",
  "←": "<-",
  "↑": "arriba",
  "↓": "abajo",
  "⁄": "/",
  "\u2212": "-", // signo menos, no el guion
  "\u2011": "-", // guion no separable
  "\u2012": "-", // guion de cifras
  "\u2033": '"', // segundos/pulgadas
  "\u2032": "'", // minutos/pies
  "•": "-", // WinAnsi lo tiene, pero como viñeta suelta en prosa corrida
  "\u00a0": " ", // espacio duro: WinAnsi lo tiene, pero `wrapText` no cortaria ahi
};

/**
 * El repertorio de WinAnsi, descrito como predicado.
 *
 * Latin-1 imprimible más los 27 huecos que WinAnsi rellena en 0x80–0x9F con
 * tipografía (comillas curvas, guiones largos, puntos suspensivos, €…). La
 * lista está fijada por la propia codificación —no va a cambiar— y la prueba de
 * humo la contrasta carácter a carácter contra pdf-lib, para que no sea una
 * afirmación de confianza.
 */
const ESPECIALES_WINANSI =
  "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d" +
  "\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178";

function esImprimible(caracter: string): boolean {
  const codigo = caracter.codePointAt(0) ?? 0;
  if (codigo >= 0x20 && codigo <= 0x7e) return true; // ASCII imprimible
  if (codigo >= 0xa0 && codigo <= 0xff) return true; // Latin-1: tildes, ñ, °, ±…
  return ESPECIALES_WINANSI.includes(caracter);
}

/**
 * Deja el texto listo para medirlo o dibujarlo. **Nunca lanza.**
 *
 * Lo que no se puede traducir se sustituye por `?`, que es lo que hacía una
 * máquina de escribir sin esa tecla: se ve que ahí había algo. Borrarlo en
 * silencio dejaría "fiebre  38" impreso en un documento clínico, que se lee
 * como un dato completo y no lo es.
 */
export function aTextoImprimible(texto: string): string {
  let salida = "";
  // **NFC primero.** Un pegado desde Word o desde macOS trae los acentos
  // DESCOMPUESTOS: la "ñ" puede venir como `n` + \u0303, y la "é" como `e` +
  // \u0301. La letra base pasaba y la tilde suelta caía en el `?`, así que el
  // historial imprimía "migran?a" y "od?nofagia" — en castellano, o sea en casi
  // cada consulta. Componer primero deja un único carácter que WinAnsi sí
  // tiene. De paso arregla las formas negadas: \u2265 + \u0338 se compone en el
  // carácter \u2271, que la tabla de arriba sí sabe traducir.
  for (const caracter of aLineaUnica(texto).normalize("NFC")) {
    const traducido = TRADUCCIONES[caracter];
    if (traducido !== undefined) {
      salida += traducido;
      continue;
    }
    salida += esImprimible(caracter) ? caracter : "?";
  }
  return salida;
}
