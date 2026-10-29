/**
 * Traducción de lo que alguien teclea a una `tsquery` que Postgres pueda
 * resolver **con índice GIN**.
 *
 * Vive fuera de `lib/pacientes/` desde la Fase 4: el buscador de CIE-10 (RF-11)
 * consulta `idx_cie10_descripcion`, que es la misma clase de índice
 * (`to_tsvector('spanish', …)`) que `idx_pacientes_nombre`, y necesita
 * exactamente las mismas dos cosas — prefijo mientras se escribe y la trampa de
 * la eñe. La alternativa era que el módulo de consultas importara de
 * `lib/pacientes/busqueda.ts`, o una segunda copia que se desincronizara en la
 * primera corrección.
 *
 * `lib/pacientes/busqueda.ts` reexporta `construirTsquery` para que sus
 * llamadores —y su prueba de humo— sigan importándola de donde ya lo hacían.
 */

/**
 * Más tokens que esto no aportan (nadie busca por seis apellidos ni por seis
 * palabras de un diagnóstico) y cada uno multiplica el tamaño de la tsquery.
 */
const MAX_TOKENS = 5;

/**
 * Cuántas letras `n` de un token se expanden a `ñ`. Ver `variantesConEnie`.
 * Con 2 el peor caso son 4 variantes por token; con más, la tsquery crece
 * exponencialmente sin ganar casos reales.
 */
const MAX_ENIES_EXPANDIBLES = 2;

/**
 * Todas las combinaciones de sustituir `n` por `ñ` en un token.
 *
 * El stemmer español NO trata la eñe como una `n` acentuada —y hace bien, es
 * otra letra—, así que `to_tsvector('spanish', 'MUÑOZ')` indexa `muñoz` y la
 * búsqueda `mun:*` no lo encuentra.
 *
 * **Con las tildes no hace falta, y conviene saber por qué**: el stemmer
 * español de Snowball termina quitando los acentos agudos, de modo que
 * `hipertensión` se indexa como `hipertension` y teclear "hipertension" la
 * encuentra. Comprobado contra las 12.634 filas que tenía `cie10_catalogo` en la Fase 4:
 * `hipertension:*` y `hipertensión:*` devuelven lo mismo, pero `migrana:*`
 * devuelve "Larva migrans visceral" y NINGUNA de las cuatro migrañas. La eñe
 * es la única letra que hay que expandir, y por eso esta función existe.
 *
 * Al revés no hace falta: si se escribe la eñe, el índice ya la tiene.
 */
export function variantesConEnie(token: string): string[] {
  if (token.includes("ñ")) return [token];

  const posiciones: number[] = [];
  for (let i = 0; i < token.length; i += 1) if (token[i] === "n") posiciones.push(i);
  if (posiciones.length === 0 || posiciones.length > MAX_ENIES_EXPANDIBLES) return [token];

  let variantes = [token];
  for (const pos of posiciones) {
    variantes = variantes.flatMap((v) => [v, `${v.slice(0, pos)}ñ${v.slice(pos + 1)}`]);
  }
  return variantes;
}

/**
 * Las piezas de la tsquery para un token: un número se pide también con el
 * guion delante; una palabra, con sus variantes de eñe.
 *
 * El parser de Postgres lee "COVID-19" como la palabra `covid` y el ENTERO
 * `-19`, con su signo: el índice guarda `'cov' '-19'`. Lo tecleado pierde el
 * guion al sanearse (ver `construirTsquery`), así que `19:*` sola no encuentra
 * "COVID-19, virus identificado" (U07.1). Comprobado contra la base el 17 de
 * octubre de 2026: `cov:* & 19:*` da 0 filas y `cov:* & (19:* | -19)`, 2.
 *
 * El número con guion va **sin prefijo**: `-1:*` encontraría también el `-19`
 * de COVID-19 al buscar "tipo 1". Con signo se pide el número exacto.
 *
 * El guion lo pone este archivo, no el usuario: la salida sigue compuesta solo
 * por piezas que genera aquí. En la práctica solo le llega al buscador de
 * CIE-10: el de pacientes manda al documento todo lo que tenga un dígito.
 */
export function piezasDeToken(token: string): string[] {
  if (/^\d+$/.test(token)) return [`${token}:*`, `-${token}`];
  return variantesConEnie(token).map((v) => `${v}:*`);
}

/**
 * Construye la tsquery para `to_tsvector('spanish', <columna>)` — la expresión
 * exacta de los índices, para que Postgres los use y no acabe en un seq scan
 * con filtro en memoria.
 *
 * Dos decisiones:
 *
 * 1. **Prefijo (`:*`)**, no palabra completa. Se busca mientras el paciente
 *    está enfrente: "gar" tiene que encontrar "GARCIA", y "farin" tiene que
 *    encontrar "Faringitis aguda", antes de terminar de escribirlo.
 *    `websearch_to_tsquery` no sabe hacer prefijos, por eso la query se arma a
 *    mano y se manda como `fts` (que es `to_tsquery`).
 *
 * 2. **Se reconstruye carácter por carácter**, quedándose solo con letras,
 *    dígitos y espacios. No es una lista negra de metacaracteres: es que la
 *    salida se compone únicamente de piezas que este archivo generó. Un `&`,
 *    un `:` o una comilla sueltos hacen que Postgres responda
 *    `42601 syntax error in tsquery` (comprobado contra la base), así que
 *    sanear aquí es a la vez corrección e inyección cerrada.
 *
 * Devuelve `null` si no queda nada buscable.
 */
export function construirTsquery(texto: string): string | null {
  const tokens = texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);

  if (tokens.length === 0) return null;

  // Los tokens se combinan con AND: "gomez luis" debe pedir los dos apellidos,
  // y "faringitis aguda" las dos palabras, no todo lo agudo del catálogo.
  return tokens
    .map((token) => {
      const variantes = piezasDeToken(token);
      return variantes.length === 1 ? variantes[0] : `(${variantes.join(" | ")})`;
    })
    .join(" & ");
}

/**
 * Quita las tildes para comparar en JavaScript, que no tiene el stemmer
 * español de Postgres.
 *
 * Se usa donde el filtrado ocurre en el servidor sobre un catálogo pequeño y no
 * en una `tsquery`: ahí no hay stemmer que normalice los acentos, y "sodico"
 * tiene que encontrar "Sódico".
 */
export function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
