// scripts/verificar-bundle-sin-secretos.mjs
//
// Comprueba que ningún secreto del .env aparezca en el JavaScript que se
// descarga el navegador.
//
// Uso (después de `npm run build`):
//   npm run verificar:bundle
//
// En local busca los secretos del `.env`. En el CI no hay `.env` ni secretos:
// el build recibe valores FALSOS y marcados (centinelas, escritos en
// .github/workflows/ci.yml) y se busca que no aparezcan. Sin ningún valor que
// buscar, falla: un "no encontré nada" sin haber buscado sería un falso verde.
//
// ---------------------------------------------------------------------------
// POR QUÉ EXISTE
// ---------------------------------------------------------------------------
//
// La regla "las claves de servicio nunca llevan prefijo NEXT_PUBLIC_" está
// escrita en CLAUDE.md, en .env.example y en Seguridad-OWASP.md, y aun así es
// una regla que se cumple *recordándola*. Esto la comprueba.
//
// El disparador fue la Fase 5: la pantalla de Configuración es el primer punto
// de la aplicación donde un componente de CLIENTE convive con código que
// descifra la clave privada de la Service Account de Google. La separación es
// real —`lib/medicamentos/sheet.ts` solo lo importa un módulo `"use server"`—
// pero "es real" y "está verificado" no son lo mismo.
//
// Busca los VALORES, no los nombres: encontrar la cadena
// "SUPABASE_SERVICE_ROLE_KEY" en un bundle no prueba nada (puede ser un mensaje
// de error); encontrar la clave sí.
//
// Sale con código 1 si encuentra algo, para poder encadenarlo con el build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Desde la raíz del repo, no desde el directorio en que se lance.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORIO = path.join(raiz, '.next', 'static');
// Lo prerenderizado también viaja al navegador: el HTML y el payload RSC de las
// rutas estáticas (y sus segmentos), y el cuerpo de las respuestas fijas. Un
// Server Component que pase un secreto como prop a un componente de cliente lo
// deja ahí, no en .next/static.
const PRERENDERIZADO = path.join(raiz, '.next', 'server', 'app');
const ENVIADO_AL_NAVEGADOR = /\.(html|rsc|body)$/;

/**
 * Lo que tiene que haber para buscar, en grupos: basta un nombre de cada uno.
 * Si falta un grupo entero, el script falla en vez de "pasar" sin haberlo
 * buscado. Supabase admite dos nombres (`lib/entorno.ts` lee los dos).
 */
const GRUPOS = [
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['GOOGLE_SERVICE_ACCOUNT_KEY_BASE64'],
  ['GOOGLE_SHEET_ID_MEDICAMENTOS'],
];
/** Se buscan si están, pero no se exigen. Hoy ninguno. */
const OPCIONALES = [];

const CUENTAS_DE_SERVICIO = ['GOOGLE_SERVICE_ACCOUNT_KEY_BASE64', 'NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY_BASE64'];

function valor(nombre) {
  const v = process.env[nombre];
  return typeof v === 'string' && v.length >= 8 ? v : null;
}

/**
 * Un trozo de la clave privada que la identifique y aparezca igual en cualquier
 * forma: la SEGUNDA línea del cuerpo base64. La primera no sirve: en una clave
 * RSA PKCS#8 casi toda es la cabecera ASN.1, igual en todas las claves. Y una
 * línea entera nunca contiene un salto, así que coincide tanto con la clave en
 * texto como escapada (`\n`) dentro de un literal de JavaScript.
 */
function fragmentoDeClave(pem) {
  const lineas = pem
    .split(/\r?\n|\\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea && !linea.startsWith('-----'));
  const linea = lineas[1] ?? lineas[0];
  return linea && linea.length >= 16 ? linea.slice(0, 60) : null;
}

/**
 * Lo que NO puede aparecer en el bundle, y los grupos que faltan.
 *
 * Qué caza: un secreto que Next COPIA al navegador. Eso pasa si se renombra a
 * `NEXT_PUBLIC_…` (por eso se busca cada nombre también con ese prefijo; en el
 * CI llevan su propio centinela) o si `next.config.ts` lo pasa por `env:` (por
 * eso también los nombres sin prefijo). Qué NO caza: importar un módulo de
 * servidor desde un componente de cliente, porque Next no copia el valor (queda
 * `undefined`); eso lo frena `server-only` al compilar (lib/supabase/admin.ts).
 *
 * Las claves PÚBLICAS (`NEXT_PUBLIC_SUPABASE_URL`, la publicable) quedan fuera:
 * esas TIENEN que estar en el bundle, y su seguridad depende de RLS, no de
 * estar ocultas (Seguridad-OWASP.md).
 */
function secretos() {
  const lista = [];
  for (const nombre of [...GRUPOS.flat(), ...OPCIONALES]) {
    for (const n of [nombre, `NEXT_PUBLIC_${nombre}`]) {
      if (valor(n)) lista.push([n, valor(n)]);
    }
  }
  // Un grupo cuenta como presente también si solo está con prefijo: es justo
  // el error que se busca, y tiene que salir como FUGA, no como "falta".
  const faltan = GRUPOS.filter((grupo) => !grupo.some((n) => valor(n) || valor(`NEXT_PUBLIC_${n}`))).map((grupo) =>
    grupo.join(' o ')
  );

  // Del JSON de la Service Account salen dos cadenas que valen por sí solas: el
  // correo (identifica la cuenta) y la clave privada (es la cuenta). También de
  // la variante con prefijo, por si alguien la expone y la descifra en el cliente.
  for (const nombre of CUENTAS_DE_SERVICIO) {
    if (!valor(nombre)) continue;
    try {
      const credenciales = JSON.parse(Buffer.from(valor(nombre), 'base64').toString('utf-8'));
      const fragmento = credenciales.private_key ? fragmentoDeClave(credenciales.private_key) : null;
      if (!credenciales.client_email || !fragmento) throw new Error('incompleta');
      lista.push([`client_email (${nombre})`, credenciales.client_email]);
      lista.push([`private_key (${nombre})`, fragmento]);
    } catch {
      if (nombre === 'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64') {
        faltan.push('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 descifrable, con client_email y private_key');
      }
    }
  }

  return { lista, faltan };
}

function archivosDe(dir) {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDe(completo));
    else salida.push(completo);
  }
  return salida;
}

if (!fs.existsSync(DIRECTORIO) || !fs.existsSync(PRERENDERIZADO)) {
  console.error('No existe .next/static o .next/server/app. Corre `npm run build` primero.');
  process.exit(1);
}

const rutas = [...archivosDe(DIRECTORIO), ...archivosDe(PRERENDERIZADO).filter((r) => ENVIADO_AL_NAVEGADOR.test(r))];
const contenidos = rutas.map((ruta) => [path.relative(raiz, ruta), fs.readFileSync(ruta, 'utf-8')]);
const { lista: aBuscar, faltan } = secretos();

console.log(`Revisando ${rutas.length} archivo(s) de .next/static y lo prerenderizado contra ${aBuscar.length} secreto(s).\n`);

let fugas = 0;
for (const [nombre, valor] of aBuscar) {
  const golpes = contenidos.filter(([, texto]) => texto.includes(valor)).map(([ruta]) => ruta);
  if (golpes.length === 0) {
    console.log(`  limpio      ${nombre}`);
  } else {
    fugas += golpes.length;
    console.log(`  ⚠ FUGA      ${nombre}`);
    for (const ruta of golpes) console.log(`                ${ruta}`);
  }
}

// Primero las fugas: si las hay, son lo importante, falte lo que falte.
if (fugas > 0) {
  console.error('\nHay secretos en el bundle del cliente. Busca un prefijo NEXT_PUBLIC_ mal puesto');
  console.error('o un `env:` en next.config.ts que copie la clave al navegador.');
  process.exit(1);
}

if (faltan.length > 0) {
  console.error('\nFaltan valores que buscar (ni en .env ni como centinela del CI):');
  for (const f of faltan) console.error(`  - ${f}`);
  console.error('Sin ellos, "ningún secreto llega al navegador" no se habría comprobado del todo.');
  process.exit(1);
}

console.log('\nNingún secreto llega al navegador.');
