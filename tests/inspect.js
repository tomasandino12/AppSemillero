import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parsearPartidoCabb } from '../src/parser/parserCabb.js';

const rutaArchivo = process.argv[2];
if (!rutaArchivo) {
  console.error('Uso: node tests/inspect.js <ruta-al-archivo.xlsx>');
  process.exit(1);
}

const datos = readFileSync(rutaArchivo);
const resultado = parsearPartidoCabb(datos, path.basename(rutaArchivo));

console.log('='.repeat(70));
console.log(`ARCHIVO: ${resultado.origen.archivo}`);
console.log(`ID PARTIDO CABB: ${resultado.origen.idPartidoCabb ?? '(sin detectar)'}`);
console.log(`HOJA: ${resultado.origen.hoja ?? '(sin detectar)'}`);
console.log('='.repeat(70));
console.log(`TÍTULO: ${resultado.partido.tituloCrudo ?? '(sin detectar)'}`);
console.log(`  Local:       ${resultado.partido.local}`);
console.log(`  Visitante:   ${resultado.partido.visitante}`);
console.log(`  Categoría:   ${resultado.partido.categoria}`);
console.log(`  Competencia: ${resultado.partido.competencia}`);
console.log(`  Año:         ${resultado.partido.anio}`);

for (const equipo of resultado.equipos) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${equipo.condicion.toUpperCase()}] ${equipo.nombre} (fila ${equipo.filaNombre})`);
  console.log('-'.repeat(70));
  for (const j of equipo.jugadores) {
    const min = j.min ? j.min.texto : '--:--';
    const numero = (j.numero ?? '?').padStart(2, ' ');
    console.log(
      `  #${numero} ${j.nombreLimpio.padEnd(35, ' ')} ` +
      `MIN ${min}  PTS ${String(j.pts ?? '-').padStart(3, ' ')}  ` +
      `2P ${j.dos.anotados ?? '-'}/${j.dos.intentados ?? '-'} (${j.dos.porcentaje ?? '-'}%)  ` +
      `3P ${j.tres.anotados ?? '-'}/${j.tres.intentados ?? '-'} (${j.tres.porcentaje ?? '-'}%)  ` +
      `TL ${j.libres.anotados ?? '-'}/${j.libres.intentados ?? '-'} (${j.libres.porcentaje ?? '-'}%)  ` +
      `REB ${j.reb.tot ?? '-'} (D${j.reb.def ?? '-'}/O${j.reb.of ?? '-'})  ` +
      `AST ${j.ast ?? '-'}  REC ${j.rec ?? '-'}  PER ${j.per ?? '-'}  ` +
      `VAL ${j.val ?? '-'}  +/- ${j.masMenos ?? '-'}  ` +
      `[clave: ${j.nombreClave}]`
    );
  }
  if (equipo.totales) {
    console.log(`  TOTALES: PTS ${equipo.totales.pts}  REB ${equipo.totales.reb.tot}  AST ${equipo.totales.ast}`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`ADVERTENCIAS (${resultado.advertencias.length}):`);
for (const a of resultado.advertencias) {
  console.log(`  fila ${a.fila ?? '-'} · ${a.campo ?? '-'} · ${a.mensaje}`);
}
console.log(`\nERRORES (${resultado.errores.length}):`);
for (const e of resultado.errores) {
  console.log(`  fila ${e.fila ?? '-'} · ${e.campo ?? '-'} · ${e.mensaje}`);
}
