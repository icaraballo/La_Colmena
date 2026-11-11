// La vibración (v11.25): pocas veces y en lo que importa. Ni al subir celdas ni al
// arrastrar: si vibra siempre, deja de decir nada.
//
//   cosecha       un toque corto
//   grande        dos toques (cosecha de COSECHA_GRANDE o más); tres si espanta todas
//   fallo         un zumbido largo: el fallo, con su plaga o su helada
//   fin           un toque medio: se acaba la partida (o se pierde el nivel)
//   record        celebración: récord nuevo, o nivel de Puzzle o del tutorial ganado
//
// En la app, con el plugin Haptics de Capacitor: en Chromalchemy (v1.22.1)
// navigator.vibrate dentro de la app no vibraba en el Samsung ni con el permiso. En la
// web, navigator.vibrate (Chrome de Android sí; Safari del iPhone no tiene, y entonces
// no sale ni el interruptor). Se apaga desde el pie de los modos y se recuerda.

const VIBRACION_KEY = 'colmena.vibracion.v1';
// Encendido, apagado, encendido… en ms (la forma de navigator.vibrate).
const PATRONES_VIBRA = {
  cosecha: [30],
  grande: [45, 70, 45],
  limpia: [45, 70, 45, 70, 45],
  fallo: [180],
  fin: [90],
  record: [50, 80, 50, 80, 160],
};

const hapticsApp = (() => {
  try {
    const cap = window.Capacitor;
    return cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Haptics || null;
  } catch { return null; }
})();

// Sólo donde vibra de verdad: la app o un móvil con navigator.vibrate (en el
// ordenador Chrome tiene la función, pero no hay motor que mover).
function puedeVibrar() {
  if (hapticsApp) return true;
  try { return typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches; }
  catch { return false; }
}

let vibracionOn = true;
try { vibracionOn = localStorage.getItem(VIBRACION_KEY) !== '0'; } catch { /* encendida */ }

function fijarVibracion(on) {
  vibracionOn = on;
  try { localStorage.setItem(VIBRACION_KEY, on ? '1' : '0'); } catch { /* sólo esta vez */ }
}

// Un patrón nuevo corta el que estuviera sonando.
let relojesVibra = [];
// `nombres`: uno o varios patrones seguidos, con una pausa entre ellos.
function patronVibra(nombres, pausa = 250) {
  const p = [];
  for (const n of [].concat(nombres)) {
    if (!PATRONES_VIBRA[n]) continue;
    if (p.length) { if (p.length % 2 === 1) p.push(pausa); else p[p.length - 1] += pausa; }
    p.push(...PATRONES_VIBRA[n]);
  }
  return p;
}
function vibrar(nombres, { forzar = false } = {}) {
  const p = patronVibra(nombres);
  if (!p.length || (!vibracionOn && !forzar) || !puedeVibrar()) return;
  relojesVibra.forEach(clearTimeout);
  relojesVibra = [];
  try {
    if (!hapticsApp) { navigator.vibrate(p); return; }
    let t = 0;
    p.forEach((ms, k) => {
      if (k % 2 === 0) relojesVibra.push(setTimeout(() => {
        try { hapticsApp.vibrate({ duration: ms }).catch(() => {}); } catch { /* sin vibrador */ }
      }, t));
      t += ms;
    });
  } catch { /* sin vibración no pasa nada */ }
}

// Lo que vibra una jugada: la cosecha (según su tamaño) y, si el turno acaba en
// fallo, el fallo detrás. Subir celdas no vibra.
function vibraJugada(esCosecha, L, hayFallo) {
  const v = [];
  if (esCosecha) v.push(L >= COSECHA_LIMPIA ? 'limpia' : L >= COSECHA_GRANDE ? 'grande' : 'cosecha');
  if (hayFallo) v.push('fallo');
  return v;
}
