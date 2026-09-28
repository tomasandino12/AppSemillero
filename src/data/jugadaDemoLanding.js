/**
 * La jugada que se anima en la landing. Es sólo para mostrar cómo se ve la
 * pizarra: no es una jugada real de ningún club. Va escrita acá y no leída de
 * la base porque la landing es pública. Tiene el mismo formato que
 * `jugada.datos` (jugadas.js), así la anima el mismo motor que el visor.
 */
export const JUGADA_DEMO_LANDING = {
  cancha: 'media',
  fichas: [
    { id: 'a1', tipo: 'ataque', numero: 1, x: 0.5, y: 0.8 },
    { id: 'a2', tipo: 'ataque', numero: 2, x: 0.16, y: 0.62 },
    { id: 'a3', tipo: 'ataque', numero: 3, x: 0.84, y: 0.62 },
    { id: 'a4', tipo: 'ataque', numero: 4, x: 0.36, y: 0.42 },
    { id: 'a5', tipo: 'ataque', numero: 5, x: 0.66, y: 0.3 },
  ],
  pelota: 'a1',
  pasos: [
    { acciones: [
      { tipo: 'pase', ficha: 'a1', a: 'a2' },
      { tipo: 'corte', ficha: 'a1', hasta: { x: 0.62, y: 0.52 } },
    ], nota: '' },
    { acciones: [
      { tipo: 'cortina', ficha: 'a4', hasta: { x: 0.3, y: 0.52 } },
      { tipo: 'dribbling', ficha: 'a2', hasta: { x: 0.34, y: 0.36 } },
    ], nota: '' },
    { acciones: [
      { tipo: 'pase', ficha: 'a2', a: 'a5' },
      { tipo: 'corte', ficha: 'a5', hasta: { x: 0.52, y: 0.18 } },
    ], nota: '' },
    { acciones: [{ tipo: 'tiro', ficha: 'a5' }], nota: '' },
  ],
};
