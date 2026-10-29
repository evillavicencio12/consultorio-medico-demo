// Prueba de humo del listado de pacientes (Fase 2, sesión A).
//
// Dos bloques:
//
//  1. **Lógica pura** — corre siempre, sin red: la traducción de lo que se
//     teclea a una tsquery, la lectura de los parámetros de URL y los textos
//     de los campos vacíos de ADR-006.
//
//  2. **Contra la base de dev** — sin `.env` (el CI) se salta; con un `.env`
//     que no apunte a dev, falla sin tocar la base. Comprueba lo que ningún
//     test en memoria puede: que cada tsquery que este código genera es
//     sintaxis VÁLIDA para Postgres (una mala devuelve 42601, o sea un 400 en
//     la cara de la doctora).
//
//  3. **Contra PGlite** — que el predicado que arma el buscador sea indexable
//     por `idx_pacientes_nombre`. Ver la nota del bloque 6.
//
//     Se corre con:  npm run test:pacientes   (vitest.config.mts carga el entorno de dev si existe)
import { test } from "vitest";
import { entornoDe } from "../lib/entorno";
import {
  MINIMO_CARACTERES,
  construirTsquery,
  leerParametros,
  normalizarBusquedaDocumento,
  tipoDeBusqueda,
} from "../lib/pacientes/busqueda";
import {
  SIN_DOCUMENTO,
  SIN_FECHA_NACIMIENTO,
  contarPacientes,
  fichaIncompleta,
  formatEdadListado,
  iniciales,
  tieneAlergia,
} from "../lib/pacientes/formato";
import { comprobar, registrar } from "./ayudas";



// ---------------------------------------------------------------------------
// 1. Cómo se traduce lo que teclea la doctora
// ---------------------------------------------------------------------------

comprobar("un token busca por prefijo", construirTsquery("lop"), "lop:*");
comprobar("dos tokens se combinan con AND", construirTsquery("gomez luis"), "gomez:* & luis:*");
comprobar(
  "las mayúsculas del Sheet dan igual",
  construirTsquery("GARCIA"),
  construirTsquery("garcia")
);

// El motivo real: el stemmer español indexa `muñoz`, no `munoz`, así que sin
// esto teclear "MUNOZ" devuelve cero y la doctora cree que hay que registrarlo
// otra vez. Verificado contra la base: `(mun:* | muñ:*)` sí lo encuentra.
comprobar("la n se expande a ñ", construirTsquery("mun"), "(mun:* | muñ:*)");
comprobar(
  "dos n dan cuatro variantes",
  construirTsquery("nun"),
  "(nun:* | nuñ:* | ñun:* | ñuñ:*)"
);
comprobar("si ya trae ñ no se expande", construirTsquery("muñ"), "muñ:*");
comprobar("con tres n ya no se expande", construirTsquery("nnn"), "nnn:*");

// La salida se compone solo de piezas que genera este módulo: cualquier
// metacarácter de tsquery que llegue de fuera se descarta antes de armarla.
comprobar("los metacaracteres se descartan", construirTsquery("a & | b"), "a:* & b:*");
comprobar("las comillas se descartan", construirTsquery("o'brito"), "o:* & brito:*");
comprobar("los dos puntos se descartan", construirTsquery("a:*"), "a:*");
comprobar("sin letras no hay consulta", construirTsquery("!!! ---"), null);
comprobar(
  "más de cinco tokens se recortan",
  construirTsquery("a b c d e f g"),
  "a:* & b:* & c:* & d:* & e:* & f:*".split(" & ").slice(0, 5).join(" & ")
);

comprobar("un dígito enruta a documento", tipoDeBusqueda("1712"), "documento");
// Lo que cambió al entrar los pasaportes: "AB123456" lleva letras y sigue
// siendo un documento. Si el buscador lo mandara a la búsqueda por nombre, un
// paciente extranjero sería imposible de encontrar por su número — y esa es la
// protección que sustituye al dígito verificador (ADR-008).
comprobar("un pasaporte alfanumérico también", tipoDeBusqueda("AB123456"), "documento");
comprobar("sin dígitos enruta a nombre", tipoDeBusqueda("garcia"), "nombre");
comprobar("la cédula se queda en dígitos", normalizarBusquedaDocumento("1712-345 678"), "1712345678");
// Antes se borraban las letras. Con pasaportes eso convertía "AB123456" en
// "123456" y la búsqueda dejaba de ser la del documento que se tecleó.
comprobar("el pasaporte CONSERVA sus letras", normalizarBusquedaDocumento("ab-123 456"), "AB123456");

// ---------------------------------------------------------------------------
// 2. Parámetros de URL
// ---------------------------------------------------------------------------

comprobar("sin parámetros: orden por defecto", leerParametros({}), {
  busqueda: "",
  busquedaEfectiva: "",
  orden: "recientes",
  soloIncompletas: false,
  // Fase 4: el listado tiene un segundo modo, "elige a quién atender", al que
  // reenvía el ítem "Nueva Consulta" del rail.
  paraConsulta: false,
});
comprobar(
  "con ?para=consulta, cada fila abrirá la consulta nueva en vez de la ficha",
  leerParametros({ para: "consulta" }).paraConsulta,
  true
);
comprobar(
  "cualquier otro valor de `para` no cambia el destino",
  leerParametros({ para: "loquesea" }).paraConsulta,
  false
);
comprobar(
  `una sola letra no consulta (mínimo ${MINIMO_CARACTERES})`,
  leerParametros({ q: "m" }).busquedaEfectiva,
  ""
);
comprobar("pero sí se conserva en el input", leerParametros({ q: "m" }).busqueda, "m");
comprobar("un orden inventado cae en el por defecto", leerParametros({ orden: "xyz" }).orden, "recientes");
comprobar("orden alfabético se respeta", leerParametros({ orden: "alfabetico" }).orden, "alfabetico");
comprobar("incompletas=1 activa el filtro", leerParametros({ incompletas: "1" }).soloIncompletas, true);
comprobar(
  "un q repetido (?q=a&q=b) no rompe",
  leerParametros({ q: ["a", "b"] }).busqueda,
  ""
);

// ---------------------------------------------------------------------------
// 3. Campos vacíos por migración (ADR-006)
// ---------------------------------------------------------------------------

const HOY = new Date("2026-08-20T12:00:00Z");

comprobar("edad normal", formatEdadListado("1992-03-10", HOY), "34 años");
comprobar("menor de un año va en meses (ADR-003)", formatEdadListado("2026-02-20", HOY), "6 meses");
comprobar("un mes, en singular", formatEdadListado("2026-07-20", HOY), "1 mes");
comprobar("un año, en singular", formatEdadListado("2025-08-20", HOY), "1 año");

// El bug que ya se corrigió una vez en el módulo de PDF: `new Date(null)` es
// 1970, así que un paciente sin fecha aparecía con 56 años perfectamente
// creíbles. Aquí devuelve null y la pantalla escribe "Edad no registrada".
comprobar("sin fecha de nacimiento NO se inventa una edad", formatEdadListado(null, HOY), null);
comprobar("cadena vacía tampoco", formatEdadListado("", HOY), null);
comprobar("fecha basura tampoco", formatEdadListado("no-es-fecha", HOY), null);

comprobar("falta documento → ficha incompleta", fichaIncompleta({ documento: null, fecha_nacimiento: "1992-03-10" }), true);
comprobar("falta fecha → ficha incompleta", fichaIncompleta({ documento: "0923456701", fecha_nacimiento: null }), true);
comprobar("con ambas → completa", fichaIncompleta({ documento: "0923456701", fecha_nacimiento: "1992-03-10" }), false);

// "Sin documento" y no "Sin cédula": de los 83 no se sabe cuál traerán, y en un
// paciente extranjero "Sin cédula" sería directamente falso.
comprobar("los textos de ausencia no son una raya muda", [SIN_DOCUMENTO, SIN_FECHA_NACIMIENTO], [
  "Sin documento",
  "Edad no registrada",
]);

// ---------------------------------------------------------------------------
// 4. Etiqueta de alergia (RF-07) y varios
// ---------------------------------------------------------------------------

comprobar("con alergia registrada, sale la etiqueta", tieneAlergia("Penicilina"), true);
comprobar("null no es 'sin alergias conocidas'", tieneAlergia(null), false);
comprobar("cadena vacía no enciende la etiqueta", tieneAlergia(""), false);
comprobar("solo espacios tampoco", tieneAlergia("   "), false);

comprobar("iniciales de los dos apellidos", iniciales("EJEMPLO DEMO ANA LUCIA"), "ED");
comprobar("un solo nombre da una inicial", iniciales("GARCIA"), "G");
comprobar("plural correcto", [contarPacientes(1), contarPacientes(164)], ["1 paciente", "164 pacientes"]);

// ---------------------------------------------------------------------------
// 5. Contra la base real (opcional)
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// `||`: una variable vacía copiada de .env.example no debe tapar a la siguiente.
const clave =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !clave) {
  // Sin .env —el CI—: se salta, no falla.
  test.skip("base de dev: sin .env, se omite", () => {});
} else if (entornoDe(url) !== "dev") {
  // Con un .env que NO apunta a dev: falla, y no se toca la base. No se usa
  // exigirDev() porque su process.exit tumbaría el proceso de Vitest.
  registrar(
    `la base de las pruebas es la de dev (este .env apunta a: ${entornoDe(url)})`,
    false,
    "Las pruebas van contra dev, nunca contra producción (lib/entorno.ts)."
  );
} else {
  const cabeceras = { apikey: clave, Authorization: `Bearer ${clave}`, Prefer: "count=exact" };

  // Lo que se busca aquí no es cuántas filas devuelve —eso depende de qué
  // pacientes haya— sino que Postgres ACEPTE la tsquery. Un `42601` es un 400
  // en la pantalla, y es el modo en que un buscador se rompe con un apellido
  // raro meses después de darlo por terminado.
  const entradas = [
    "tan",
    "MUNOZ",
    "gomez luis",
    "o'brien",
    "a & | b",
    "!!!",
    "  ",
    "María Ñ",
    "a b c d e f g h",
    "'; drop table pacientes; --",
    "*:*",
    "%_",
  ];

  for (const entrada of entradas) {
    const tsquery = construirTsquery(entrada);
    if (tsquery === null) {
      registrar(`"${entrada}" no genera consulta (nada buscable)`, true);
      continue;
    }
    const filtro = `nombre_completo=fts(spanish).${encodeURIComponent(tsquery)}`;
    const respuesta = await fetch(`${url}/rest/v1/pacientes?select=id&${filtro}&limit=1`, {
      headers: cabeceras,
    });
    if (respuesta.ok) {
      const n = respuesta.headers.get("content-range")?.split("/")[1];
      registrar(`"${entrada}" → ${tsquery}  (${n} coincidencias)`, true);
    } else {
      registrar(`"${entrada}" → ${tsquery}`, false, await respuesta.text());
    }
  }

}

// ---------------------------------------------------------------------------
// 6. Que el predicado sea INDEXABLE por idx_pacientes_nombre
// ---------------------------------------------------------------------------
// Sobre PGlite (PostgreSQL en WASM, ya es devDependency) y no contra
// producción, por dos razones:
//
//   * PostgREST solo devuelve el plan si el proyecto tiene `db-plan-enabled`,
//     que en Supabase viene apagado — pedirlo responde 406.
//   * Y aunque se pudiera: con 164 filas Postgres elegiría un Seq Scan **y
//     tendría razón**, leer la tabla entera es más barato que abrir el índice.
//     Un EXPLAIN contra la base de hoy no probaría nada.
//
// La invariante que sí se puede comprobar, y la que de verdad importa, es que
// la expresión que genera este código —`to_tsvector('spanish', nombre_completo)
// @@ to_tsquery('spanish', …)`— CASE con la del índice. Se fuerza con
// `enable_seqscan = off`: si aun así el planificador no puede usarlo, es que la
// expresión no coincide; basta que alguien ponga 'simple' en un lado para que
// el índice quede de adorno y la búsqueda se degrade en silencio al crecer.
//
// El CREATE INDEX se lee de la migración, no se copia aquí: si cambia allá,
// esta prueba lo persigue.
try {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync } = await import("node:fs");

  const migracion = readFileSync("supabase/migrations/20260820120100_pacientes.sql", "utf8");
  // Sobre el archivo entero y no partiendo por ";": la sentencia ocupa varias
  // líneas y viene precedida de su comentario, que se quedaría pegado delante.
  const createIndex = migracion.match(/create index idx_pacientes_nombre[\s\S]*?;/i)?.[0];
  if (!createIndex) throw new Error("no se encontró idx_pacientes_nombre en la migración");

  const db = await PGlite.create();
  await db.exec("create table public.pacientes (nombre_completo text not null);");
  await db.exec(`${createIndex};`);
  await db.exec(
    "insert into public.pacientes (nombre_completo) select 'APELLIDO' || g || ' NOMBRE' from generate_series(1, 500) g;"
  );
  await db.exec("analyze public.pacientes; set enable_seqscan = off;");

  const plan = await db.query<Record<string, string>>(
    "explain select 1 from public.pacientes where to_tsvector('spanish', nombre_completo) @@ to_tsquery('spanish', $1)",
    [construirTsquery("apellido")]
  );
  const texto = plan.rows.map((fila) => Object.values(fila).join(" ")).join("\n");

  comprobar(
    "el predicado del buscador es indexable por idx_pacientes_nombre",
    texto.includes("idx_pacientes_nombre"),
    true
  );
  if (!texto.includes("idx_pacientes_nombre")) console.log(texto);
  await db.close();
} catch (err) {
  // Antes era un "AVISO" impreso y la suite seguía en verde sin haber hecho la
  // comprobación (una migración renombrada, un CREATE INDEX que el regex ya no
  // encuentra). Ahora es un test fallido.
  registrar("el predicado del buscador es indexable por idx_pacientes_nombre", false,
    `no se pudo comprobar el índice con PGlite: ${err}`);
}

