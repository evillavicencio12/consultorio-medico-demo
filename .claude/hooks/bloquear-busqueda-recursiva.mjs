// .claude/hooks/bloquear-busqueda-recursiva.mjs
//
// Hook PreToolUse de Claude Code para Bash y PowerShell: bloquea las búsquedas
// recursivas que no respetan .gitignore, y la lectura directa de .env, porque
// terminan mostrando secretos (pasó el 18 de octubre de 2026: un `grep -rn` de
// un subagente mostró la contraseña de dev). Para buscar está la herramienta
// Grep, que respeta .gitignore y las reglas Read. `git grep` pasa: busca solo
// en archivos versionados (salvo con --no-index o --untracked, que se bloquean).
//
// Es la red fina; las reglas deny de .claude/settings.json son la gruesa. Ver
// docs/arquitectura/Trampas-Recurrentes.md.
//
// Contrato del hook: recibe por stdin el JSON de la llamada
// ({ tool_name, tool_input: { command } }). Para bloquear, sale con código 2 y
// el motivo en stderr, que le llega al agente. Si no es Bash ni PowerShell, o
// no hay nada que bloquear, sale con 0 sin escribir nada. Si el hook mismo
// falla (excepción, entrada que no es JSON), avisa en stderr y sale con 1:
// Claude Code muestra ese aviso y deja pasar el comando. Si `node` no está,
// el shell sale con 127 y pasa lo mismo. Ver el aviso = el hook está caído.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// El comando desde el programa hasta el siguiente separador (tubería, `;`,
// `&&`, `||` o salto de línea) que no esté entre comillas: en `grep -E "a|b" -r .`
// el `|` es parte del patrón.
function argumentosDesde(texto, desde) {
  let comilla = null;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (comilla) {
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") comilla = c;
    else if (c === '|' || c === ';' || c === '\n' || (c === '&' && texto[i + 1] === '&')) return texto.slice(desde, i);
  }
  return texto.slice(desde);
}

// Lo que va antes del programa dentro del mismo comando (para reconocer
// `git … grep`). No corta en las comillas: `git -C "ruta" grep` sigue siendo git.
function prefijoHasta(texto, hasta) {
  const antes = texto.slice(0, hasta);
  let corte = -1;
  for (const s of ['|', ';', '&', '\n', '`', '(']) corte = Math.max(corte, antes.lastIndexOf(s));
  return antes.slice(corte + 1);
}

// Un grupo de opciones cortas que incluye alguna de las letras dadas: `-r`,
// `-rn`, `-inR`, con un número pegado (`-rC2`, `-rm1`) y entre comillas
// (`'-r'`: la shell las quita).
const opcionCorta = (letras) => new RegExp(`(^|\\s)["']?-[A-Za-z0-9]*[${letras}][A-Za-z0-9]*["']?(?=\\s|$)`);
// Un argumento que nombra un archivo .env (salvo la plantilla) o un glob de la
// shell que se expande a él (`.env*`, `.*` sin comillas).
const ARG_ENV = /(^|[\s"'=/\\])\.env(?!\.example\b)(\.[\w.-]+)?([*?[]|(?=[\s"']|$))|(^|\s)\.\*(?=\s|$)/;
const LECTORES = String.raw`((e|f)?grep|rg|cat|head|tail|sed|awk|less|more|sh|bash|cmd|powershell|pwsh)`;
// Una lista de archivos armada con find dentro del comando: `grep x $(find .)`.
const SUSTITUCION_FIND = /\$\(\s*find\b|`\s*find\b/;
// Un programa: el nombre sin importar mayúsculas y con `.exe` opcional (NTFS).
const programa = (nombre) => new RegExp(String.raw`(?<![\w.-])(?:${nombre})(?:\.exe)?(?![\w.-])`, 'gi');

const REGLAS = [
  {
    programa: programa('(?:e|f)?grep'),
    motivo(args, prefijo) {
      if (/^\s*git(\.exe)?(\s|$)/i.test(prefijo)) {
        // git grep busca solo en lo versionado, salvo con estas banderas.
        return /--no-index|--untracked|--no-exclude-standard/.test(args) ? 'git grep fuera de los archivos versionados' : null;
      }
      if (opcionCorta('rR').test(args) || /--recursive|--dereference-recursive|(-d\s*|--directories=)recurse/.test(args)) {
        return 'grep recursivo';
      }
      if (ARG_ENV.test(args)) return 'grep sobre un archivo .env';
      if (SUSTITUCION_FIND.test(args)) return 'grep sobre una lista de archivos armada con find';
      return null;
    },
  },
  {
    programa: programa('rg'),
    motivo(args) {
      if (/--no-ignore|--unrestricted/.test(args) || opcionCorta('u').test(args)) {
        return 'rg sin respetar .gitignore (--no-ignore / --unrestricted / -u)';
      }
      // Un glob de -g se impone a .gitignore (`rg --hidden -g '*'` lee .env).
      // Solo pasan las exclusiones (`-g '!…'`); para filtrar está la herramienta Grep.
      if (/(^|\s)(-g|--glob|--iglob)(\s+|=)(?!["']?!)/.test(args)) return 'rg con un glob de inclusión (se impone a .gitignore)';
      if (ARG_ENV.test(args)) return 'rg sobre un archivo .env';
      return null;
    },
  },
  {
    programa: programa('findstr'),
    motivo(args) {
      // `//s`: así escribe Git Bash una opción de Windows para que no la tome por ruta.
      // findstr también acepta las opciones con `-`.
      if (/(^|\s)(\/{1,2}|-)[A-Za-z]*[sS][A-Za-z]*(?=\s|$)/.test(args)) return 'findstr /s';
      return ARG_ENV.test(args) ? 'findstr sobre un archivo .env' : null;
    },
  },
  {
    programa: programa('find'),
    motivo(args) {
      return new RegExp(String.raw`-(exec|execdir|ok|okdir)\s+\S*\b${LECTORES}\b`, 'i').test(args)
        ? 'find -exec que lee el contenido de los archivos'
        : null;
    },
  },
  {
    programa: programa('xargs'),
    motivo(args) {
      return new RegExp(String.raw`(^|\s)${LECTORES}(\.exe)?(\s|$)`, 'i').test(args) ? 'xargs que lee el contenido de los archivos' : null;
    },
  },
  {
    // Lectura directa de un .env, en Bash o en PowerShell.
    programa: programa('cat|type|head|tail|less|more|sed|awk|Get-Content|gc|Select-String|sls'),
    motivo(args) {
      if (ARG_ENV.test(args)) return 'lectura directa de un archivo .env';
      return SUSTITUCION_FIND.test(args) ? 'lectura de una lista de archivos armada con find' : null;
    },
  },
];

// PowerShell: recorrer (-Recurse o cualquier abreviatura suya, o -Depth) y leer
// el contenido en el mismo comando, aunque sea en dos pasos (`$f = gci -r; $f | sls`).
const PS_RECURSIVO = String.raw`\s-(r(e(c(u(r(s(e)?)?)?)?)?)?|depth)\b`;
const PS_LEE = /\b(Select-String|sls|Get-Content|gc|cat|type)\b/i;

/** Devuelve el motivo del bloqueo, o null si el comando puede correr. */
export function motivoDeBloqueo(comando, herramienta = 'Bash') {
  if (typeof comando !== 'string' || !comando) return null;
  for (const regla of REGLAS) {
    regla.programa.lastIndex = 0;
    let m;
    while ((m = regla.programa.exec(comando))) {
      const motivo = regla.motivo(argumentosDesde(comando, m.index + m[0].length), prefijoHasta(comando, m.index));
      if (motivo) return motivo;
    }
  }
  if (/\bSelect-String\b[^|;\n]*\s-Recurse\b/i.test(comando)) return 'Select-String -Recurse';
  // En la herramienta PowerShell `ls` es Get-ChildItem; por el Bash de Git es el `ls` de siempre.
  const recorre = new RegExp(String.raw`\b(Get-ChildItem|gci|dir${herramienta === 'PowerShell' ? '|ls' : ''})\b[^|;\n]*${PS_RECURSIVO}`, 'i');
  if (recorre.test(comando) && PS_LEE.test(comando)) return 'Get-ChildItem recursivo que lee el contenido de los archivos';
  return null;
}

async function main() {
  let entrada = '';
  for await (const trozo of process.stdin) entrada += trozo;
  const llamada = JSON.parse(entrada);
  if (llamada?.tool_name !== 'Bash' && llamada?.tool_name !== 'PowerShell') return 0;
  const motivo = motivoDeBloqueo(llamada.tool_input?.command, llamada.tool_name);
  if (!motivo) return 0;
  process.stderr.write(
    `Bloqueado por .claude/hooks/bloquear-busqueda-recursiva.mjs: ${motivo}. ` +
      'Las búsquedas recursivas por la terminal no respetan .gitignore y leen .env. ' +
      'Usa la herramienta Grep (o git grep, que solo busca en archivos versionados). ' +
      'Ver docs/arquitectura/Trampas-Recurrentes.md.\n',
  );
  return 2;
}

// Solo cuando lo ejecuta Claude Code, no cuando lo importa la prueba.
// import.meta.main (Node 24); si no existe, se comparan las rutas reales, para
// que un junction, un symlink o una ruta 8.3 no apaguen el hook en silencio.
function esEjecutado() {
  if (typeof import.meta.main === 'boolean') return import.meta.main;
  if (!process.argv[1]) return false;
  const real = (r) => fs.realpathSync.native(r).toLowerCase();
  return real(process.argv[1]) === real(fileURLToPath(import.meta.url));
}

if (esEjecutado()) {
  try {
    process.exitCode = await main();
  } catch (error) {
    // Un error propio no bloquea el comando (código 1: aviso que no bloquea),
    // pero tiene que verse: sin el hook, la red fina no está.
    process.stderr.write(
      `AVISO: el hook .claude/hooks/bloquear-busqueda-recursiva.mjs está caído y NO revisó este comando ` +
        `(${error instanceof Error ? error.message : String(error)}). Hay que revisarlo ` +
        '(docs/arquitectura/Trampas-Recurrentes.md).\n',
    );
    process.exitCode = 1;
  }
}
