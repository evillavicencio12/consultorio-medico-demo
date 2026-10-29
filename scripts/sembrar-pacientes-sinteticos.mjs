// scripts/sembrar-pacientes-sinteticos.mjs
//
// Siembra ~20 pacientes SINTÉTICOS en el proyecto de dev, con los casos borde
// que la app tiene que aguantar. Ningún dato sale de producción: todo está
// escrito aquí, con nombres que empiezan por "PRUEBA " para que no se
// confundan con nadie.
//
// Uso:
//   npm run sembrar:pacientes
//   (= node --env-file=.env scripts/sembrar-pacientes-sinteticos.mjs)
//
// Solo corre contra dev o una base local: la guarda de lib/entorno.ts corta
// antes de conectarse si el entorno es producción o uno desconocido.
//
// Es idempotente: borra los pacientes "PRUEBA %" (y antes sus consultas, porque
// la FK de consultas es `on delete restrict`; las recetas caen en cascada) y
// los vuelve a insertar. No toca ningún otro paciente.
//
// Las fechas "cumple 18 hoy / mañana" se calculan con el día de HOY EN ECUADOR
// y aritmética de componentes, nunca con `new Date("YYYY-MM-DD")`, que en
// UTC-5 resta un día (CLAUDE.md, trampas recurrentes).

import { clienteParaScript } from '../lib/entorno.ts';
import { digitoVerificador, validarDocumento } from '../lib/pacientes/documento.ts';

const PREFIJO = 'PRUEBA ';

/** Cédula sintética con dígito verificador válido (el mismo módulo 10 de ADR-008). */
function cedula(provincia, secuencia) {
  const base = `${String(provincia).padStart(2, '0')}0${String(secuencia).padStart(6, '0')}`;
  return base + digitoVerificador(base);
}

/** Hoy en Ecuador como { y, m, d }, sin pasar por la zona horaria de la máquina. */
function hoyEnEcuador() {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' })
    .format(new Date())
    .split('-')
    .map(Number);
  return { y, m, d };
}

function fecha({ y, m, d }) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Suma días con aritmética UTC sobre componentes (sin parsear texto). */
function masDias({ y, m, d }, dias) {
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const esBisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * La misma fecha `n` años antes. Un 29 de febrero que cae en año no bisiesto
 * pasa a 28: sin esto, sembrar un 28/29 de febrero generaba '20xx-02-29' en
 * años que no lo tienen y Postgres rechazaba el lote entero.
 */
function haceAnios(n, base = hoy) {
  const y = base.y - n;
  const d = base.m === 2 && base.d === 29 && !esBisiesto(y) ? 28 : base.d;
  return fecha({ y, m: base.m, d });
}

const hoy = hoyEnEcuador();
const manana = masDias(hoy, 1);

const ACOMPANANTE = {
  nombre_acompanante: 'PRUEBA ACOMPAÑANTE MADRE',
  documento_acompanante: cedula(30, 900001),
  tipo_documento_acompanante: 'cedula',
  telefono_acompanante: '0990000000',
};

// Cada fila declara qué caso cubre; `caso` no se guarda.
const PACIENTES = [
  { caso: 'adulto completo', nombre_completo: 'PRUEBA ADULTO COMPLETO UNO', tipo_documento: 'cedula', documento: cedula(30, 1), fecha_nacimiento: haceAnios(40), sexo: 'F', telefono: '0990000001', correo: 'prueba.uno@example.com', domicilio: 'Calle Ficticia 123', ocupacion: 'Docente', estado_civil: 'Casada', antecedentes_heredofamiliares: 'Madre con hipertensión' },
  { caso: 'cédula de provincia 01-24', nombre_completo: 'PRUEBA CEDULA PROVINCIA AZUAY', tipo_documento: 'cedula', documento: cedula(1, 2), fecha_nacimiento: haceAnios(55), sexo: 'M' },
  { caso: 'cédula de provincia 24', nombre_completo: 'PRUEBA CEDULA PROVINCIA SANTA ELENA', tipo_documento: 'cedula', documento: cedula(24, 3), fecha_nacimiento: haceAnios(31), sexo: 'F' },
  { caso: 'sin documento', nombre_completo: 'PRUEBA SIN DOCUMENTO', tipo_documento: 'cedula', documento: null, fecha_nacimiento: haceAnios(62), sexo: 'M' },
  { caso: 'sin documento ni fecha ni sexo (migrado)', nombre_completo: 'PRUEBA MIGRADO SIN DATOS', tipo_documento: 'cedula', documento: null, fecha_nacimiento: null, sexo: null },
  { caso: 'sin fecha de nacimiento', nombre_completo: 'PRUEBA SIN FECHA NACIMIENTO', tipo_documento: 'cedula', documento: cedula(30, 4), fecha_nacimiento: null, sexo: 'F' },
  { caso: 'sin sexo', nombre_completo: 'PRUEBA SIN SEXO', tipo_documento: 'cedula', documento: cedula(30, 5), fecha_nacimiento: haceAnios(28), sexo: null },
  { caso: 'pasaporte', nombre_completo: 'PRUEBA PASAPORTE EXTRANJERA', tipo_documento: 'pasaporte', documento: 'ZZ1234567', fecha_nacimiento: haceAnios(35), sexo: 'F' },
  { caso: 'pasaporte, hombre mayor', nombre_completo: 'PRUEBA PASAPORTE VISITANTE', tipo_documento: 'pasaporte', documento: 'ZX7654321', fecha_nacimiento: haceAnios(70), sexo: 'M' },
  { caso: 'documento tipo otro', nombre_completo: 'PRUEBA DOCUMENTO OTRO', tipo_documento: 'otro', documento: 'REF-ZZ-0001', fecha_nacimiento: haceAnios(45), sexo: 'M' },
  { caso: 'menor con acompañante con cédula', nombre_completo: 'PRUEBA MENOR CON MADRE', tipo_documento: 'cedula', documento: cedula(30, 6), fecha_nacimiento: haceAnios(8), sexo: 'M', ...ACOMPANANTE },
  { caso: 'menor con acompañante con pasaporte', nombre_completo: 'PRUEBA MENOR ACOMPAÑANTE EXTRANJERO', tipo_documento: 'pasaporte', documento: 'ZM0000001', fecha_nacimiento: haceAnios(15), sexo: 'F', nombre_acompanante: 'PRUEBA ACOMPAÑANTE PADRE', documento_acompanante: 'ZP0000001', tipo_documento_acompanante: 'pasaporte' },
  { caso: 'menor sin documento propio', nombre_completo: 'PRUEBA BEBE SIN DOCUMENTO', tipo_documento: 'cedula', documento: null, fecha_nacimiento: haceAnios(1), sexo: 'F', ...ACOMPANANTE },
  { caso: 'cumple 18 HOY (ya es adulto, ADR-003)', nombre_completo: 'PRUEBA CUMPLE DIECIOCHO HOY', tipo_documento: 'cedula', documento: cedula(30, 7), fecha_nacimiento: haceAnios(18), sexo: 'M' },
  { caso: 'cumple 18 MAÑANA (todavía menor)', nombre_completo: 'PRUEBA CUMPLE DIECIOCHO MANANA', tipo_documento: 'cedula', documento: cedula(30, 8), fecha_nacimiento: haceAnios(18, manana), sexo: 'F', ...ACOMPANANTE },
  { caso: 'con alergia', nombre_completo: 'PRUEBA ALERGICO PENICILINA', tipo_documento: 'cedula', documento: cedula(30, 9), fecha_nacimiento: haceAnios(50), sexo: 'M', alergia_actual: 'Penicilina' },
  { caso: 'tildes y eñe', nombre_completo: 'PRUEBA ÑANDÚ JOSÉ ÁNGEL MUÑOZ', tipo_documento: 'cedula', documento: cedula(30, 10), fecha_nacimiento: haceAnios(33), sexo: 'M', domicilio: 'Av. Ñuñoa y Pérez' },
  { caso: 'nombre muy largo (espacio del PDF)', nombre_completo: 'PRUEBA NOMBRE EXCESIVAMENTE LARGO PARA VERIFICAR EL ESPACIO DISPONIBLE EN LA HOJA IMPRESA', tipo_documento: 'cedula', documento: cedula(30, 11), fecha_nacimiento: haceAnios(29), sexo: 'F' },
  { caso: 'adulto mayor', nombre_completo: 'PRUEBA ADULTO MAYOR NOVENTA', tipo_documento: 'cedula', documento: cedula(30, 12), fecha_nacimiento: haceAnios(91), sexo: 'F' },
  { caso: 'apellido compartido (búsqueda)', nombre_completo: 'PRUEBA ADULTO COMPLETO DOS', tipo_documento: 'cedula', documento: cedula(30, 13), fecha_nacimiento: haceAnios(38), sexo: 'M' },
];

/**
 * Pasa cada documento por la MISMA validación que el alta de la app y lo deja
 * normalizado como lo guardaría ella. Si algo no pasa, no se escribe nada.
 */
function validarSemilla() {
  const errores = [];
  for (const p of PACIENTES) {
    if (!p.nombre_completo.startsWith(PREFIJO)) errores.push(`${p.caso}: el nombre no empieza por "${PREFIJO}"`);
    for (const [campo, tipo] of [['documento', 'tipo_documento'], ['documento_acompanante', 'tipo_documento_acompanante']]) {
      if (!p[campo]) continue;
      const r = validarDocumento(p[campo], p[tipo]);
      if (r.valido) p[campo] = r.documento;
      else errores.push(`${p.caso}: ${campo} ${p[campo]} inválido (${r.motivo})`);
    }
  }
  return errores;
}

async function main() {
  // La guarda (solo dev o local) y el cliente, en ese orden (lib/entorno.ts).
  const supabase = clienteParaScript('La siembra de pacientes sintéticos', { produccion: 'nunca' });

  const errores = validarSemilla();
  if (errores.length) {
    console.error('La semilla no pasa la validación de la app; no se escribió nada:');
    for (const e of errores) console.error(`  - ${e}`);
    process.exit(1);
  }

  const { data: previos, error: errPrevios } = await supabase
    .from('pacientes')
    .select('id')
    .like('nombre_completo', `${PREFIJO}%`);
  if (errPrevios) throw new Error(`Leyendo pacientes previos: ${errPrevios.message}`);

  // PostgREST no da transacciones entre llamadas: si el insert fallara después
  // de borrar, dev quedaría sin sintéticos. Por eso todo lo que puede hacerlo
  // fallar se comprueba ANTES de borrar: los documentos ya pasaron por
  // validarSemilla(), y aquí se descarta un choque del UNIQUE (tipo, documento)
  // con un paciente de dev que no sea sintético.
  const documentos = PACIENTES.filter((p) => p.documento).map((p) => p.documento);
  const { data: choques, error: errChoques } = await supabase
    .from('pacientes')
    .select('nombre_completo, tipo_documento, documento')
    .in('documento', documentos)
    .not('nombre_completo', 'like', `${PREFIJO}%`);
  if (errChoques) throw new Error(`Buscando choques de documento: ${errChoques.message}`);
  if (choques?.length) {
    console.error('Hay pacientes NO sintéticos con documentos de la semilla; no se borró ni escribió nada:');
    for (const c of choques) console.error(`  - ${c.tipo_documento} ${c.documento}`);
    process.exit(1);
  }

  const ids = (previos ?? []).map((p) => p.id);
  if (ids.length) {
    const { error: errConsultas } = await supabase.from('consultas').delete().in('paciente_id', ids);
    if (errConsultas) throw new Error(`Borrando consultas sintéticas: ${errConsultas.message}`);
    const { error: errBorrar } = await supabase.from('pacientes').delete().in('id', ids);
    if (errBorrar) throw new Error(`Borrando pacientes sintéticos: ${errBorrar.message}`);
  }

  // `caso` documenta la fila, no es una columna.
  const filas = PACIENTES.map((p) => {
    const fila = { ...p };
    delete fila.caso;
    return fila;
  });
  // `defaultToNull: false`: en un insert por lotes, PostgREST rellena con NULL
  // las columnas que faltan en alguna fila en vez de aplicar su DEFAULT, y
  // `tipo_documento_acompanante` es `not null default 'cedula'`.
  const { error: errInsertar } = await supabase.from('pacientes').insert(filas, { defaultToNull: false });
  if (errInsertar) throw new Error(`Insertando: ${errInsertar.message}`);

  console.log(`Hoy en Ecuador: ${fecha(hoy)}. Borrados ${ids.length} sintéticos previos, insertados ${filas.length}:`);
  for (const p of PACIENTES) console.log(`  - ${p.caso}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
