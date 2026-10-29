// scripts/import-cie10.mjs
//
// Importación del catálogo CIE-10 a Supabase.
// Fuente: https://github.com/verasativa/CIE-10 (cie-10.csv)
// Referencia: docs/integraciones/Catalogo-CIE10.md
//
// Uso (Node 24, con el soporte nativo de --env-file y el borrado de tipos):
//   node --env-file=.env scripts/import-cie10.mjs --dry-run                          # dev
//   node --env-file=.env scripts/import-cie10.mjs                                    # dev
//   node --env-file="<ruta del .env.produccion>" scripts/import-cie10.mjs --dry-run --produccion  # producción
//   node --env-file="<ruta del .env.produccion>" scripts/import-cie10.mjs --produccion            # producción
//   (cualquiera de los cuatro, con --quitar-rangos, borra también los rangos)
//
// Contra producción exige la bandera --produccion además del archivo de entorno,
// también en --dry-run (lib/entorno.ts, docs/arquitectura/Entornos.md).
//
// Al CSV le aplica supabase/datos/cie10-ajustes.json (códigos que la fuente no
// trae y correcciones de descripción, cada uno con su fuente).
//
// Con --dry-run descarga el CSV, lo compara con la base y dice qué haría
// —cuántos códigos nuevos, cuáles cambiarían de descripción— sin escribir nada.
// Sin --dry-run escribe SOLO esos (upsert por código). Lo que está en la base y
// no en la selección solo se informa, con UNA excepción que hay que pedir:
// --quitar-rangos borra los rangos ("C00-C14"), que no son códigos. Nunca borra
// un código, ni sin la bandera. Si una consulta usara un rango, la FK de
// consultas.cie10_codigo hace fallar el borrado.
//
// Requiere en el archivo de entorno (ver .env.example en la raíz):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY  (nunca la publicable,
//                                 porque este script escribe saltando RLS)

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { clienteParaScript } from '../lib/entorno.ts';
import {
  aplicarAjustes,
  clasificarContraCatalogo,
  leerCatalogoExistente,
  rangos,
  seleccionarCodigos,
  validarAjustes,
} from '../lib/cie10/importar.ts';

// Fijado a un commit, no a `master`: el catálogo tiene que poder reconstruirse
// igual, y el SHA-256 frena un archivo distinto antes de tocar la base. El CSV
// no cambia desde ese commit (23 de febrero de 2019).
const CSV_URL =
  'https://raw.githubusercontent.com/verasativa/CIE-10/da2aec199492344d280e0d25ae085a52ff197740/cie-10.csv';
const CSV_SHA256 = 'c3963d12c44706be2bc629c2beb401cd249a51db45cc24a4e22198f771824765';
const BATCH_SIZE = 500;

// Lo que se agrega o se corrige sobre la fuente: U07.1/U07.2 y las correcciones
// de la doctora. Versionado, con la fuente de cada fila (Catalogo-CIE10.md).
const AJUSTES = new URL('../supabase/datos/cie10-ajustes.json', import.meta.url);

/** Los que la doctora más usa y que el filtro anterior dejaba fuera: se informa si están. */
const DE_CONTROL = ['I10', 'J00', 'R51', 'K30', 'A09', 'U071', 'U072'];

/** `--dry-run`: se descarga y se compara, pero no se escribe en la base. */
const SIMULACION = process.argv.includes('--dry-run');

/** `--quitar-rangos`: borra los rangos de la base (con --dry-run, solo dice cuáles). */
const QUITAR_RANGOS = process.argv.includes('--quitar-rangos');

async function main() {
  // La guarda de entorno y el cliente, en ese orden (lib/entorno.ts).
  const supabase = clienteParaScript('La importación del CIE-10', { produccion: 'con-bandera' });

  console.log('Descargando el CSV...');
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`No se pudo descargar el CSV: ${response.status} ${response.statusText}`);
  }
  // La huella va sobre los bytes descargados, no sobre el texto decodificado:
  // así es la misma que da `sha256sum` sobre el archivo.
  const bytes = Buffer.from(await response.arrayBuffer());
  const huella = createHash('sha256').update(bytes).digest('hex');
  if (huella !== CSV_SHA256) {
    throw new Error(`El CSV no es el esperado (SHA-256 ${huella}). No se escribió nada.`);
  }

  const { data, errors } = Papa.parse(bytes.toString('utf-8'), { header: true, skipEmptyLines: true });
  if (errors.length > 0) {
    // Con la huella fijada no debería pasar; si pasa, mejor no escribir nada.
    throw new Error(`El CSV tiene ${errors.length} filas con problemas de formato (${errors[0].message}). No se escribió nada.`);
  }

  const seleccion = seleccionarCodigos(data);
  console.log(`Filas en el CSV: ${data.length}`);
  console.log(`Códigos finales de la fuente: ${seleccion.registros.length} (de ellos, ${seleccion.categoriasFinales.length} categorías de tres caracteres sin subdivisiones)`);

  const ajustes = validarAjustes(JSON.parse(readFileSync(AJUSTES, 'utf-8')));
  const { registros, agregados, incluidosAMano, corregidos, dejanDeSerFinales } = aplicarAjustes(seleccion, ajustes);
  const lista = (codigos) => `${codigos.length}${codigos.length ? ` (${codigos.join(', ')})` : ''}`;
  console.log(`Ajustes (supabase/datos/cie10-ajustes.json): ${ajustes.length}`);
  console.log(`  agregan códigos que la fuente no trae: ${lista(agregados)}`);
  console.log(`  incluyen códigos de la fuente que la regla deja fuera: ${lista(incluidosAMano)}`);
  console.log(`  corrigen descripciones: ${lista(corregidos)}`);
  console.log(`  sacan de la selección códigos que dejan de ser finales: ${lista(dejanDeSerFinales)}`);
  console.log(`Códigos seleccionables: ${registros.length}`);

  // Se clasifica ANTES de escribir: después, todo estaría en la base y "nuevos" daría cero.
  const existentes = await leerCatalogoExistente(supabase);
  const { nuevos, cambianDescripcion, sinCambio, soloEnLaBase } = clasificarContraCatalogo(registros, existentes);
  const aQuitar = QUITAR_RANGOS ? rangos(soloEnLaBase) : [];
  const quitados = new Set(aQuitar);
  const aEscribir = [...nuevos, ...cambianDescripcion.map(({ codigo, despues }) => ({ codigo, descripcion: despues }))];

  if (!SIMULACION) {
    for (let i = 0; i < aEscribir.length; i += BATCH_SIZE) {
      const lote = aEscribir.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('cie10_catalogo').upsert(lote, { onConflict: 'codigo' });
      if (error) {
        // Los lotes anteriores ya quedaron escritos: se dice cuáles, para saber
        // exactamente qué cambió en la base (en producción, sobre todo).
        console.error(`Error en el lote ${i / BATCH_SIZE + 1}: ${error.message}`);
        const escritos = aEscribir.slice(0, i).map((r) => r.codigo);
        console.error(`Escritos antes del error: ${escritos.length}${escritos.length ? ` (${escritos.join(', ')})` : ''}`);
        console.error(`Sin escribir: ${aEscribir.length - i}. Se puede volver a correr: escribe solo lo que falta.`);
        process.exit(1);
      }
    }
    if (aQuitar.length > 0) {
      // Después de escribir lo nuevo: si el borrado falla (la FK, si una
      // consulta usara un rango), lo nuevo ya quedó y se avisa.
      const { error, count } = await supabase
        .from('cie10_catalogo')
        .delete({ count: 'exact' })
        .in('codigo', aQuitar);
      if (error) {
        console.error(`No se pudieron quitar los rangos: ${error.message}. Lo nuevo sí quedó escrito.`);
        process.exit(1);
      }
      // Sin error no quiere decir que borró: con 0 filas (otra corrida, RLS)
      // PostgREST también responde bien. Se cuenta.
      if (count !== aQuitar.length) {
        console.error(`Se pidieron quitar ${aQuitar.length} rangos y se quitaron ${count}. Revisa la base antes de seguir.`);
        process.exit(1);
      }
    }
  }

  console.log(SIMULACION ? '\n--- Resumen (SIMULACIÓN: no se escribió nada) ---' : '\n--- Resumen ---');
  console.log(`En la base antes: ${existentes.length}`);
  console.log(`${SIMULACION ? 'Se agregarían' : 'Se agregaron'}: ${nuevos.length}`);
  console.log(`${SIMULACION ? 'Cambiarían de descripción' : 'Cambiaron de descripción'}: ${cambianDescripcion.length}`);
  console.log(`Sin cambio: ${sinCambio}`);
  console.log(`En la base y no en la selección: ${soloEnLaBase.length}${QUITAR_RANGOS ? '' : ' (no se borran)'}`);
  if (QUITAR_RANGOS) {
    console.log(`  ${SIMULACION ? 'se quitarían' : 'se quitaron'} (rangos): ${aQuitar.length}`);
    console.log(`  se quedan (códigos que no son finales): ${soloEnLaBase.length - aQuitar.length}`);
  }
  // Después de escribir se relee la base: el total y los de control salen de lo
  // que de verdad quedó, no de una suma.
  const despues = SIMULACION
    ? [...existentes, ...nuevos].filter((e) => !quitados.has(e.codigo))
    : await leerCatalogoExistente(supabase);
  console.log(`${SIMULACION ? 'Quedarían en la base' : 'En la base después (releída)'}: ${despues.length}`);

  const enCatalogo = new Set(despues.map((e) => e.codigo));
  console.log(`\nDe control: ${DE_CONTROL.map((c) => `${c} ${enCatalogo.has(c) ? 'sí' : 'NO'}`).join(', ')}`);

  if (nuevos.length > 0) {
    console.log(`\n${SIMULACION ? 'Se agregarían' : 'Se agregaron'}: ${nuevos.map((n) => n.codigo).join(', ')}`);
  }
  for (const { codigo, antes, despues } of cambianDescripcion) {
    console.log(`  ${codigo}: "${antes}" → "${despues}"`);
  }
  if (aQuitar.length > 0) console.log(`\n${SIMULACION ? 'Se quitarían' : 'Se quitaron'}: ${aQuitar.join(', ')}`);
  const quedan = soloEnLaBase.filter((c) => !quitados.has(c));
  if (quedan.length > 0) console.log(`\nEn la base y no en la selección: ${quedan.join(', ')}`);

  console.log(SIMULACION ? '\nSimulación completa. No se escribió nada.' : '\nImportación completa.');
  console.log('Recuerda: esta fuente no es oficial del MSP Ecuador; la doctora revisa una muestra antes de operar.');
}

main().catch((err) => {
  console.error('Falló la importación:', err);
  process.exit(1);
});
