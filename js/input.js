// El arrastre es el único verbo del juego, así que tiene que ser impecable.
//
// Con TRÁNSITO (DESIGN §3): la cadena es un conjunto conexo, no un camino. El
// dedo puede volver a pasar por una celda ya elegida para llegar a otra rama, y
// esa celda no cuenta dos veces.
//
// Volver atrás para QUITAR y volver atrás para PASAR son el mismo gesto, y
// mientras la cadena admite más celdas gana el tránsito. Pero con la cadena
// COMPLETA el tránsito ya no sirve para nada —no cabe ni una más—, así que desde
// la v7 volver ahí quita la última celda. Y mientras sigas desandando
// exactamente el mismo camino, sigue quitando (deshacer encadenado). En cuanto
// añades una celda o te sales del camino, vuelve el tránsito.
//
// Rectificar también se puede de golpe: levantar el dedo con la cadena
// incompleta no juega nada, y sacarlo del panal y soltarlo fuera cancela aunque
// la cadena sea válida (v7).
//
//   drag.cells       las celdas elegidas, sin repetir — es lo que se valida
//   drag.desde       para cada celda de `cells`, desde cuál llegó el dedo a ella
//   drag.trail       el recorrido del dedo, con repeticiones — dónde está el dedo
//   drag.deshaciendo se está desandando el camino: volver atrás sigue quitando
//   drag.fuera       el dedo está fuera del panal: soltar ahí cancela
//   drag.rechazo     la última vecina que no entró y por qué: { tile, motivo }
//                    (v11.2, para los avisos del tutorial), o null

const drag = { cells: [], desde: [], trail: [], deshaciendo: false, fuera: false, active: false, rechazo: null };

function dragReady(s) {
  return drag.cells.length > 0 && isValidDrag(s, drag.cells);
}

// Nivel de la cadena en curso, sin contar la reina (comodín). -1 si no hay
// ninguna celda que no sea la reina.
function nivelEnCurso(s, cells) {
  const c = cells.find(i => !esReina(s, i));
  return c === undefined ? -1 : s.height[c];
}

// Lo que pasa con la cadena cuando el dedo entra en la celda `i`. Pura: no toca
// ni el estado ni `drag`, devuelve la cadena nueva (o la misma si no cambia
// nada). Así se puede probar en Node sin DOM (v7, G.4): es la lógica que más
// fácil se rompe y hasta la v6 no tenía ni un test.
//
//   cadena = { cells, desde, trail, deshaciendo }
//
// `porque` (v11.2, T-49), opcional: si la celda es una vecina que no entra, se
// apunta ahí el motivo, `'nivel'` (de otro nivel) o `'lleno'` (la cadena ya
// está completa). Los avisos del tutorial lo leen de aquí, de quien decide, y
// no de una copia de esta lógica. No cambia qué se acepta ni lo que se devuelve.
function pasoDeCadena(s, cadena, i, porque) {
  const { cells, desde, trail } = cadena;
  if (i < 0 || cells.length === 0) return cadena;
  const aqui = trail[trail.length - 1];
  if (i === aqui) return cadena;
  if (!vecinas(s, aqui).includes(i)) return cadena;              // sólo a una vecina

  // Quitar: el dedo está en la última celda añadida y vuelve a la celda desde
  // la que llegó a ella. Se usa `desde` y no «la penúltima de cells»: con
  // tránsito, la última puede colgar de otra rama.
  const k = cells.length - 1;
  const completa = !s.danza && cells.length >= s.step;
  if ((completa || cadena.deshaciendo) && k > 0 && aqui === cells[k] && i === desde[k]) {
    return { cells: cells.slice(0, k), desde: desde.slice(0, k), trail: [...trail, i], deshaciendo: true };
  }

  if (cells.includes(i)) {                                // tránsito
    return { cells, desde, trail: [...trail, i], deshaciendo: false };
  }
  if (!jugable(s, i)) return cadena;
  const h = nivelEnCurso(s, cells);
  if (!esReina(s, i) && h !== -1 && s.height[i] !== h) {                // misma altura
    if (porque) porque.motivo = 'nivel';
    return cadena;
  }
  if (completa) { if (porque) porque.motivo = 'lleno'; return cadena; } // ni una de más

  return { cells: [...cells, i], desde: [...desde, aqui], trail: [...trail, i], deshaciendo: false };
}

// Móvil tumbado (v11.21, CR-17): la página se contrarrota y sigue en vertical
// respecto al móvil (app.js, vigilarGiro; el CSS de :root[data-giro]). El dedo
// llega en coordenadas de la ventana, que ya no son las de la página: hay que
// girarlas. `giro` es '90' (la página va a −90°), '270' (a +90°) o nada; `ancho`
// y `alto`, los de la ventana. Pura, para probarla en Node.
//   '90':  rotate(-90deg) lleva (x, y) de la página a (y, −x) → al revés, x = alto − y'
//   '270': rotate(90deg)  lleva (x, y) a (−y, x)              → al revés, y = ancho − x'
function giroAPagina(x, y, giro, ancho, alto) {
  if (giro === '90') return [alto - y, x];
  if (giro === '270') return [y, ancho - x];
  return [x, y];
}
function giroActual() {
  return typeof document !== 'undefined' ? document.documentElement.dataset.giro : undefined;
}
// Un punto de la ventana (clientX, clientY), en coordenadas de la página.
function aPagina(x, y) {
  return giroAPagina(x, y, giroActual(), window.innerWidth, window.innerHeight);
}
// Lo mismo para un evento del dedo (los gestos de deslizar de app.js).
const dedoX = e => aPagina(e.clientX, e.clientY)[0];
const dedoY = e => aPagina(e.clientX, e.clientY)[1];
// getBoundingClientRect, en coordenadas de la página. Con la página girada, la
// caja que da el navegador es la del elemento ya girado: se giran dos esquinas
// opuestas y se vuelve a ordenar.
function rectEnPagina(el) {
  const r = el.getBoundingClientRect();
  if (!giroActual()) return r;
  const [x1, y1] = aPagina(r.left, r.top), [x2, y2] = aPagina(r.right, r.bottom);
  const left = Math.min(x1, x2), top = Math.min(y1, y2), right = Math.max(x1, x2), bottom = Math.max(y1, y2);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
// El ancho de la página: con el móvil tumbado es el alto de la ventana.
function anchoPagina() {
  return giroActual() ? window.innerHeight : window.innerWidth;
}

// getState es una función, no el estado: al reiniciar la partida se crea un
// objeto nuevo y un closure sobre el viejo seguiría hablando con la anterior.
// `alSoltar` (v11.2), opcional: se llama al levantar el dedo con lo que había,
// { cells, cancelada, valida }, se juegue o no. El tutorial lo usa para contar
// lo que no ha contado (soltar fuera, soltar antes de llegar al paso).
function initInput(canvas, getState, onCommit, redraw, alSoltar) {
  // Con el móvil tumbado, el dedo y el lienzo se giran a la página (CR-17).
  const pos = (e) => {
    const r = rectEnPagina(canvas), [x, y] = aPagina(e.clientX, e.clientY);
    return [(x - r.left) * (canvas.width / r.width),
            (y - r.top) * (canvas.height / r.height)];
  };

  // ¿Ha sacado el dedo del panal? Tiene que estar FUERA DEL CANVAS y además a
  // más de 1,5·R de cualquier celda viva: con una sola de las dos, pasarse un
  // poco del borde al arrastrar deprisa cancelaría jugadas sin querer.
  const fuera = (s, x, y) => {
    if (x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height) return false;
    for (let i = 0; i < s.height.length; i++) {
      if (!existe(s, i)) continue;
      if (Math.hypot(x - layout.cx[i], y - topY(s, i)) <= 1.5 * layout.R) return false;
    }
    return true;
  };

  const limpiar = () => {
    drag.cells = []; drag.desde = []; drag.trail = [];
    drag.deshaciendo = false; drag.fuera = false; drag.rechazo = null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = getState();
    if (s.gameOver) return;
    const i = tileAt(s, ...pos(e));
    if (i < 0 || !jugable(s, i)) return;
    canvas.setPointerCapture(e.pointerId);
    drag.active = true;
    limpiar();
    drag.cells = [i]; drag.desde = [-1]; drag.trail = [i];
    redraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    e.preventDefault();
    const s = getState();
    const [x, y] = pos(e);
    const f = fuera(s, x, y);
    if (f !== drag.fuera) { drag.fuera = f; redraw(); }
    if (f) return;
    const i = tileAt(s, x, y), porque = {};
    const nueva = pasoDeCadena(s, drag, i, porque);
    if (nueva === drag) {
      if (porque.motivo && !(drag.rechazo && drag.rechazo.tile === i)) { drag.rechazo = { tile: i, motivo: porque.motivo }; redraw(); }
      return;
    }
    Object.assign(drag, nueva);
    drag.rechazo = null;
    redraw();
  });

  const end = (e) => {
    if (!drag.active) return;
    const s = getState();
    drag.active = false;
    const cells = drag.cells;
    const cancelada = drag.fuera || e.type === 'pointercancel';
    limpiar();
    // Una cadena inválida simplemente se descarta: no gasta turno ni penaliza.
    // Soltar fuera del panal, tampoco: es la salida de emergencia.
    const valida = isValidDrag(s, cells);
    if (alSoltar) alSoltar({ cells, cancelada, valida });
    if (!cancelada && valida) onCommit(cells);
    redraw();
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
