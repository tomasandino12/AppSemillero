# PARSER.md — Contrato del parser CABB

## Qué hace

`src/parser/parserCabb.js` recibe un `.xlsx` exportado por la app de la CABB (vía
`parsearPartidoCabb(datos, nombreArchivo)`) y devuelve un objeto de datos verificado.
Es club-agnóstico: no filtra ni conoce ningún club, y nunca lanza excepciones.

## Nota sobre los fixtures reales de test

Los 4 archivos `.xlsx` reales usados por `tests/parserCabb.test.js` (`estadisticaPartido_2026105023.xlsx`,
`estadisticaPartido_2026105329.xlsx`, `DOC-20260901-WA0002.xlsx`,
`estadisticaPartido_2026105541sub17.xlsx`) están **deliberadamente excluidos de git**
(ver `.gitignore`): contienen nombres reales de jugadores, incluyendo menores de la
categoría U17. No se suben al repo bajo ninguna circunstancia.

Un desarrollador que clone este repo y quiera correr los tests que dependen de estos
archivos debe conseguirlos por su cuenta (exportación real del club/CABB) y colocarlos en
`tests/fixtures/` con esos 4 nombres exactos. Sin ellos, `npm test` sigue corriendo
completo: los tests que dependen de los fixtures se saltean automáticamente (`skip`) en
vez de fallar.

## API

```js
import { parsearPartidoCabb } from './src/parser/parserCabb.js';

const resultado = parsearPartidoCabb(datos, nombreArchivo);
```

- `datos`: `ArrayBuffer` o `Uint8Array` del archivo `.xlsx`. Funciona igual en navegador y en Node.
- `nombreArchivo`: string, usado sólo para extraer `idPartidoCabb`. El parser no lee del disco.

También se exportan, para poder testearlas sueltas: `limpiarNombre`, `clavearNombre`,
`parsearFraccion`, `parsearMinutos`, `parsearEntero`, `parsearTitulo`.

## Contrato de salida (versión "1.0")

```js
{
  contrato: "1.0",
  origen: {
    archivo: "estadisticaPartido_2026105023.xlsx",
    idPartidoCabb: "2026105023", // string o null si el nombre de archivo no matchea /estadisticaPartido_(\d+)/i
    hoja: "Estadísticas-",       // nombre real del worksheet encontrado
  },
  partido: {
    tituloCrudo: "Estadísticas - LOCAL vs VISITANTE - CATEGORIA - COMPETENCIA - CABB - AÑO",
    local: "...",       // string o null
    visitante: "...",   // string o null
    categoria: "U21M",  // string o null
    competencia: "ARBB FORMATIVAS MASCULINO 2026", // string o null
    anio: 2026,          // number o null
    // Sin fecha de partido: la carga el entrenador en la etapa de import (Etapa 2).
  },
  equipos: [
    {
      condicion: "local" | "visitante", // por posición: el primer bloque de arriba a abajo es local
      nombre: "...",         // string o null
      filaNombre: 13,        // número de fila del archivo (para debug), 1-indexado
      jugadores: [ Jugador ],
      totales: { fila, ...Metricas } | null, // mismas métricas que un jugador (con fila), sin numero/nombre
    },
    // ... exactamente 2 entradas si no hubo errores
  ],
  advertencias: [ { fila: 22, campo: "val", mensaje: "[CODIGO] ..." } ],
  errores: [ { fila: null, campo: null, mensaje: "[CODIGO] ..." } ],
}
```

`Jugador`:

```js
{
  fila: 16,               // número de fila del archivo, 1-indexado
  numero: "10",           // string o null si la celda estaba vacía
  nombreCrudo: "GIMÉNEZ , DAVID",   // string exacto del archivo, sin tocar
  nombreLimpio: "GIMÉNEZ, DAVID",   // trim + espacios/comas normalizados
  apellido: "GIMÉNEZ",
  nombre: "DAVID",
  nombreClave: "GIMENEZ DAVID",     // único campo usado para matchear jugadores entre partidos
  min: { texto: "24:23", segundos: 1463 } | null,
  pts: 12,          // number o null
  dos:    { anotados, intentados, porcentaje },   // cada subcampo number o null independientemente
  tres:   { anotados, intentados, porcentaje },
  libres: { anotados, intentados, porcentaje },
  reb: { def, of, tot },
  ast, rec, per,     // number o null
  tap: { cometidos, recibidos },
  fal: { cometidas, recibidas },
  val,          // number o null, puede ser negativo
  masMenos,     // number o null, puede ser negativo
}
```

Reglas clave:
- `porcentaje` se guarda tal como viene del archivo, nunca recalculado.
- Cualquier campo numérico ilegible queda en `null` (nunca `0`, nunca `NaN`) y genera una advertencia `CAMPO_INVALIDO`.
- Jugadores con `00:00` de minutos sí se incluyen (lista completa de convocados).
- El número de camiseta (`numero`) no es identificador estable entre partidos — el matcheo de jugadores es siempre por `nombreClave`.

## Catálogo de advertencias (nunca detienen el parseo)

| Código | Cuándo aparece |
|---|---|
| `SIN_NUMERO` | La celda `Num.` de un jugador está vacía. |
| `NOMBRE_SIN_COMA` | El nombre limpio no tiene una coma para separar apellido/nombre. |
| `CAMPO_INVALIDO` | Una celda numérica, de fracción (`A/I`) o de tiempo (`MIN`) no se pudo parsear. |
| `PORCENTAJE_INCONSISTENTE` | El `%` de la planilla difiere en más de 1 punto del calculado desde `anotados/intentados`. |
| `REBOTES_INCONSISTENTES` | `reb.tot` no es igual a `reb.def + reb.of`. |
| `SUMA_INCONSISTENTE` | La suma de una columna de jugadores no coincide con la fila `TOTALES` del bloque (se chequea en `pts`, `reb.def`, `reb.of`, `reb.tot`, `ast`, `rec`, `per`, `fal.cometidas`, `fal.recibidas`). |
| `SIN_TOTALES` | No se encontró la fila `TOTALES` de un bloque antes de llegar al siguiente bloque (o al final de la hoja). `equipos[].totales` queda `null` en ese caso; los jugadores ya encontrados se conservan. |
| `SIN_NOMBRE_EQUIPO` | No se encontró el nombre del equipo de un bloque antes de llegar al bloque anterior (o al inicio de la hoja). `nombre` queda `null` en ese caso. |

Estas discrepancias nunca son errores: los planilleros de inferiores anotan bien los datos
esenciales pero las estadísticas secundarias tienen errores de conteo habituales. El dato
se carga igual — la advertencia sirve para saber qué tan confiable es una planilla.

## Catálogo de errores (el parseo puede quedar incompleto, pero la función nunca lanza excepción)

| Código | Cuándo aparece |
|---|---|
| `LECTURA_FALLIDA` | El buffer no es un `.xlsx` válido, o algo inesperado rompió el parseo. |
| `SIN_HOJA_ESTADISTICAS` | Ningún worksheet del libro empieza con "Estadísticas". |
| `TITULO_INVALIDO` | No se encontró una celda que empiece con `"Estadísticas - "`, o no tiene `" vs "` para separar local/visitante. |
| `HEADERS_INVALIDOS` | No se encontraron exactamente 2 filas con la celda `"Num."`, o una fila de headers no tiene las 22 columnas esperadas en el orden esperado. |
| `ORDEN_AGRUPADORES_INVALIDO` | La fila de agrupadores de tiro no tiene `"TC 2P", "TC 3P", "TL"` en ese orden — la CABB cambió el formato de exportación. |

## Si la CABB cambia el formato de exportación

1. Correr `node tests/inspect.js <archivo-nuevo>.xlsx` y mirar la sección `ERRORES`.
2. Si aparece `HEADERS_INVALIDOS` u `ORDEN_AGRUPADORES_INVALIDO`: **no adaptar el parser a ciegas**.
   Abrir el archivo a mano (o volcar la grilla cruda con SheetJS) y comparar contra las
   posiciones documentadas en el prompt original de la Etapa 1 antes de tocar código.
3. Si el test de "15 (ahora 13) jugadores distintos de Newell's" u otro test con números
   concretos falla al agregar un archivo nuevo: verificar primero si los datos realmente
   cambiaron (nuevo jugador, jugador dado de baja) antes de asumir que el parser está mal.

## Nota de seguridad sobre la dependencia

`xlsx` (SheetJS) 0.18.5, la última versión publicada en npm, tiene 2 advisories conocidos
sin fix publicado en npm (prototype pollution, ReDoS — `npm audit`). SheetJS publica el
fix real sólo en su propio CDN, no en npm. Es la única dependencia que autoriza el spec de
esta etapa; no se agregó ninguna alternativa sin preguntar primero.
