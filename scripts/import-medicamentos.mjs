// scripts/import-medicamentos.mjs
//
// Importación del catálogo de medicamentos desde Google Sheets a Supabase.
// Referencia: docs/integraciones/Contrato-Sheet-Medicamentos.md
//
// Uso:
//   node --env-file=.env scripts/import-medicamentos.mjs --dry-run           # dev
//   node --env-file=.env scripts/import-medicamentos.mjs                     # dev
//   node --env-file="<ruta del .env.produccion>" scripts/import-medicamentos.mjs --dry-run --produccion
//   node --env-file="<ruta del .env.produccion>" scripts/import-medicamentos.mjs --produccion
//
// Contra producción exige la bandera --produccion además del archivo de entorno,
// también en --dry-run: la regla es una sola y no tiene excepciones que
// recordar (lib/entorno.ts, docs/arquitectura/Entornos.md). En producción, la
// vía normal es la pantalla de Configuración.
//
// Con --dry-run lee el Sheet y dice exactamente qué haría —cuántos genéricos,
// cuántos comerciales, cuáles son nuevos, qué duplicados— pero NO escribe nada
// en la base. Sirve para revisar el Sheet después de tocarlo, sin consecuencias.
//
// Requiere en .env (ver .env.example en la raíz, con las instrucciones de conversión a Base64):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   GOOGLE_SERVICE_ACCOUNT_KEY_BASE64   (contenido del JSON de la Service Account, en Base64)
//   GOOGLE_SHEET_ID_MEDICAMENTOS        (el ID de la hoja, de la URL de Google Sheets)
//   GOOGLE_SHEET_RANGE_MEDICAMENTOS     (opcional, si la pestaña no se llama "Hoja1")
//
// Este script NO lee el archivo de credenciales
// del disco, solo la variable de entorno. El JSON de la Service Account vive
// fuera del repositorio (un nivel arriba). El Sheet debe estar compartido con
// permiso Viewer con el "client_email" que aparece dentro de ese JSON.
//
// ---------------------------------------------------------------------------
// ESTE SCRIPT YA NO TIENE LÓGICA PROPIA
// ---------------------------------------------------------------------------
//
// Desde la Fase 5 la transposición, la detección de duplicados y el upsert
// viven en `lib/medicamentos/importar.ts`, y la lectura del Sheet en
// `lib/medicamentos/sheet.ts`. Los mismos módulos que usa la pantalla de
// Configuración de la aplicación. Aquí solo queda el envoltorio de terminal:
// leer los argumentos, crear el cliente e imprimir el resumen.
//
// Es el mismo principio de lib/edad.ts y lib/texto-plano.ts: una sola fuente de
// verdad. Un bug corregido en la pantalla no puede reaparecer en la terminal,
// porque las dos ejecutan el mismo código.
//
// **Un .mjs importando un .ts, sin compilar nada.** Node 24 borra los tipos de
// forma nativa; la condición es que el import traiga la extensión REAL del
// archivo (`.ts`) en vez de omitirla. Por eso esos módulos no usan el alias
// `@/` ni importan `server-only`: ver la cabecera de importar.ts.
//
// Node imprime un aviso `MODULE_TYPELESS_PACKAGE_JSON` al cargar esos .ts,
// porque el package.json no declara `"type": "module"`. Es ruido, no un fallo:
// Node los reparsea como ESM y sigue. Declararlo arreglaría el aviso y
// cambiaría de golpe la interpretación de todos los .js del proyecto, que es
// mucho riesgo por un renglón de consola.
//
// ---------------------------------------------------------------------------
// LAS DOS DIFERENCIAS CON LA IMPORTACIÓN DE PACIENTES, Y LAS DOS IMPORTAN
// ---------------------------------------------------------------------------
//
// 1. **Esta sí se repite.** La de pacientes fue única —correrla dos veces por
//    accidente costó 82 filas duplicadas, ver la migración inicial de datos—
//    porque hace `insert` a secas. Esta usa `upsert` sobre `nombre_comercial`,
//    que tiene UNIQUE en el esquema: correrla mil veces deja el mismo resultado
//    que correrla una. El Sheet sigue creciendo y la reimportación es una
//    función del sistema (RF-13), no una tarea de instalación.
//
// 2. **El Sheet está TRASPUESTO respecto a la tabla.** Es una tabla ancha: la
//    fila 1 trae los principios activos como encabezado de columna, y debajo de
//    cada uno cuelgan sus nombres comerciales. La tabla, en cambio, guarda una
//    fila por medicamento comercial. Así que se recorre por COLUMNAS, no por
//    filas. Quien lo hace es `analizarSheet`.

import {
  analizarSheet,
  clasificarContraCatalogo,
  contarCatalogo,
  escribirCatalogo,
  leerCatalogoExistente,
} from '../lib/medicamentos/importar.ts';
import { leerSheetMedicamentos } from '../lib/medicamentos/sheet.ts';
import { clienteParaScript } from '../lib/entorno.ts';

/** `--dry-run`: se lee el Sheet y se reporta, pero no se escribe en la base. */
const SIMULACION = process.argv.includes('--dry-run');

async function main() {
  // La guarda de entorno y el cliente, en ese orden (lib/entorno.ts).
  const supabase = clienteParaScript('La importación de medicamentos', { produccion: 'con-bandera' });

  console.log('Leyendo el Sheet de medicamentos...');
  const { filas, rango } = await leerSheetMedicamentos();

  const analisis = analizarSheet(filas, rango);

  console.log(
    `Filas leídas: ${analisis.filasLeidas} (1 de encabezados + ${analisis.filasLeidas - 1} de nombres comerciales)`
  );
  console.log(`Ancho de la tabla: ${analisis.anchoReal} columnas (rango: ${rango})`);

  // ¿El rango está recortando el Sheet por la derecha?
  //
  // Pasó de verdad la primera vez que se corrió esto: el .env traía
  // `MEDICAMENTOS!A1:Z` —26 columnas— y la pestaña tenía 67 principios
  // activos. La importación no falló ni avisó de nada: escribió los 26
  // primeros y dejó 41 genéricos fuera, en silencio. Un catálogo a medias es
  // peor que uno vacío, porque parece completo cuando la doctora busca.
  if (analisis.rangoRecortado) {
    const { tope } = analisis.rangoRecortado;
    console.warn(
      `\n⚠  El rango ${rango} llega hasta la columna ${tope} y los datos ocupan las ${analisis.anchoReal}.`
    );
    console.warn(
      '   Puede que el Sheet siga a la derecha y se esté importando a medias. Quita el tope de columna'
    );
    console.warn(
      `   en GOOGLE_SHEET_RANGE_MEDICAMENTOS (por ejemplo, solo el nombre de la pestaña) y vuelve a correrlo.\n`
    );
  }

  if (analisis.aImportar.length === 0) {
    console.log('\nNo hay ningún medicamento que importar. ¿El Sheet está vacío o la pestaña es otra?');
    process.exit(0);
  }

  // Qué le pasaría a cada fila si se escribiera ahora. Se calcula ANTES del
  // upsert: después, todo estaría ya en la base y "nuevos" daría cero.
  const existentes = await leerCatalogoExistente(supabase);
  const { nuevos, cambianGenerico, sinCambio } = clasificarContraCatalogo(
    analisis.aImportar,
    existentes
  );

  let escritos = 0;
  if (!SIMULACION) {
    const escritura = await escribirCatalogo(supabase, analisis.aImportar, (hechos, total) =>
      console.log(`Escritos ${hechos} / ${total}...`)
    );
    if (!escritura.ok) {
      console.error(`Error en el lote ${escritura.lote}:`, escritura.mensaje);
      process.exit(1);
    }
    escritos = escritura.escritos;
  }

  const totalEnCatalogo = await contarCatalogo(supabase);

  // --- Resumen ------------------------------------------------------------
  console.log(SIMULACION ? '\n--- Resumen (SIMULACIÓN: no se escribió nada) ---' : '\n--- Resumen ---');
  console.log(`Principios activos (columnas con encabezado):  ${analisis.columnasConGenerico}`);
  console.log(`  de ellos, sin ningún comercial cargado aún:  ${analisis.genericosSinComerciales}`);
  console.log(
    SIMULACION
      ? `Medicamentos comerciales que se importarían:   ${analisis.aImportar.length}`
      : `Medicamentos comerciales importados/actualizados: ${escritos}`
  );
  console.log(`  nuevos (no estaban en el catálogo):         ${nuevos.length}`);
  console.log(`  cambian de principio activo:                ${cambianGenerico.length}`);
  console.log(`  ya estaban idénticos:                       ${sinCambio}`);
  console.log(
    SIMULACION
      ? `Total en el catálogo AHORA (sin tocar):        ${totalEnCatalogo ?? '?'}`
      : `Total en el catálogo tras esta corrida:        ${totalEnCatalogo ?? '?'}`
  );

  if (analisis.celdasVacias > 0) {
    console.log(`Celdas vacías omitidas: ${analisis.celdasVacias} (normal: el Sheet se llena por partes)`);
  }
  if (analisis.columnasSinEncabezado > 0) {
    console.log(
      `\nAviso: ${analisis.columnasSinEncabezado} columna(s) traen nombres comerciales pero NO tienen principio activo en la fila 1. Se omitieron enteras: sin encabezado no hay forma de saber a qué genérico pertenecen.`
    );
  }
  if (analisis.repetidosMismoGenerico > 0) {
    console.log(
      `Repetidos bajo el MISMO principio activo: ${analisis.repetidosMismoGenerico} (se ignoró la copia; no hay nada que revisar)`
    );
  }

  if (nuevos.length > 0) {
    console.log(SIMULACION ? '\nSe agregarían:' : '\nSe agregaron:');
    for (const m of nuevos) console.log(`   "${m.nombre_comercial}"  (${m.nombre_generico})`);
  }
  if (cambianGenerico.length > 0) {
    console.log(SIMULACION ? '\nCambiarían de principio activo:' : '\nCambiaron de principio activo:');
    for (const m of cambianGenerico) {
      console.log(`   "${m.nombre_comercial}"  ${m.antes} -> ${m.despues}`);
    }
  }

  if (analisis.conflictos.length > 0) {
    console.log(
      `\n⚠  ${analisis.conflictos.length} nombre(s) comercial(es) aparecen bajo principios activos DISTINTOS.`
    );
    console.log('   Casi siempre es un error de tipeo en el Sheet. Se conservó la primera aparición;');
    console.log('   revísalos y vuelve a correr el script — es repetible, no hace falta limpiar nada.\n');
    for (const c of analisis.conflictos) {
      console.log(`   "${c.nombre_comercial}"`);
      console.log(`      se guardó como   ${c.generico_conservado}  (${c.celda_conservada})`);
      console.log(`      se descartó      ${c.generico_descartado}  (${c.celda_descartada})`);
    }
  } else {
    console.log('Sin nombres comerciales repetidos bajo genéricos distintos.');
  }

  console.log(SIMULACION ? '\nSimulación completa. No se escribió nada.' : '\nImportación completa.');
}

main().catch((err) => {
  console.error('Falló la importación:', err);
  process.exit(1);
});
