// Dibujo del panal. Esta es la única capa que conoce el canvas, y la única que
// cambia cuando se toque la estética. El motor no se entera.
//
// Hexágonos pointy-top en falso 2.5D: cada nivel desplaza la celda LIFT px hacia
// arriba y se dibuja el lateral del prisma debajo, de forma que la escalera se
// lee de un vistazo.
const LIFT = 9;

// Los colores de cada nivel, LEVEL_COLORS, viven en constants.js desde la v10.2
// (los usa también el editor de puzles, que no carga este fichero).

// El símbolo de cada ítem vive en ITEM_INFO (constants.js), junto al nombre y
// lo que hace, para que la gota y la leyenda del HUD no puedan discrepar.

const layout = { cx: [], cy: [], R: 0, w: 0 };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

// Calcula el centro de cada celda para el tamaño actual del canvas y el perfil
// de filas del tablero (v10, T-43: hasta la v9.1 suponía el panal de 24, con 6
// celdas en la fila más ancha y 5 filas; para él las cuentas dan lo mismo que
// antes, 6·√3+1 de ancho y 10,5 de alto).
function computeLayout(width, height, arriba = height > width * 1.1 ? 0.3 : 0.5, filas = ROW_WIDTHS) {
  const ancha = Math.max(...filas);
  const R = Math.min(width / (ancha * Math.sqrt(3) + 1), height / (1.5 * (filas.length - 1) + 4.5));
  const w = Math.sqrt(3) * R;
  layout.R = R; layout.w = w;
  layout.cx.length = 0; layout.cy.length = 0;

  const totalH = 1.5 * R * (filas.length - 1) + 2 * R;
  // `arriba`: qué parte del hueco libre queda encima del panal. En pantalla
  // vertical (el móvil) no va centrado sino más arriba: centrado quedaba bajo,
  // lejos del HUD (playtest de la v8). En horizontal (el PC), centrado. app.js
  // lo afina por modo.
  const top = (height - totalH) * arriba + R + MAX_LEVEL * LIFT * 0.5;

  filas.forEach((n, r) => {
    const rowW = n * w;
    for (let c = 0; c < n; c++) {
      layout.cx.push((width - rowW) / 2 + w / 2 + c * w);
      layout.cy.push(top + r * 1.5 * R);
    }
  });
}

// Encuadra el panal en sus celdas vivas (v11.2, el tutorial): el disco de 7 del
// tutorial vive en el tablero de 37 y, medido para el tablero entero, se vería
// diminuto. Escala y centra lo que ha calculado computeLayout para que las
// celdas que existen llenen el hueco, sin pasar de `maxR` de radio.
function encuadrar(s, width, height, maxR) {
  const vivas = [];
  for (let i = 0; i < s.height.length; i++) if (existe(s, i)) vivas.push(i);
  if (!vivas.length) return;
  const R = layout.R, w = layout.w, alto = MAX_LEVEL * LIFT;
  const x0 = Math.min(...vivas.map(i => layout.cx[i])) - w / 2, x1 = Math.max(...vivas.map(i => layout.cx[i])) + w / 2;
  const y0 = Math.min(...vivas.map(i => layout.cy[i])) - R - alto, y1 = Math.max(...vivas.map(i => layout.cy[i])) + R + LIFT;
  const k = Math.min((width - 2 * R * 0.3) / (x1 - x0), (height - 2 * R * 0.3) / (y1 - y0), maxR / R);
  const ox = (width - (x1 - x0) * k) / 2 - x0 * k, oy = (height - (y1 - y0) * k) / 2 - y0 * k;
  for (let i = 0; i < layout.cx.length; i++) { layout.cx[i] = layout.cx[i] * k + ox; layout.cy[i] = layout.cy[i] * k + oy; }
  layout.R = R * k; layout.w = w * k;
}

// La subida en ola (v11.22, T-14): las celdas de la jugada que suben un peldaño
// lo suben con un rebote, una detrás de otra por donde pasó el dedo, y sueltan un
// aro blanco al llegar. app.js las apunta al jugar (i → { s, de, t0 }); el motor
// ya ha subido la celda, esto sólo cambia dónde se dibuja durante medio segundo.
// Sube hasta de + 1,25 (se pasa un cuarto de peldaño) y se asienta en de + 1.
const subidas = new Map();
const SUBIDA_MS = 170, ASIENTO_MS = 265, OLA_MS = 40, ARO_MS = 310;
let relojSubida = 0;   // el `now` del último dibujo, para topY fuera de draw

// Una curva cubic-bezier(x1, y1, x2, y2) de CSS: busca el parámetro por bisección.
function curva(x1, y1, x2, y2) {
  const b = (p1, p2, u) => 3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;
  return t => {
    let a = 0, z = 1, u = t;
    for (let n = 0; n < 20; n++) { u = (a + z) / 2; if (b(x1, x2, u) < t) a = u; else z = u; }
    return b(y1, y2, u);
  };
}
const subir = curva(0.2, 0.7, 0.3, 1), asentar = curva(0.4, 0, 0.6, 1);

// La subida en marcha de una celda: { h, de, f } (altura visual con decimales,
// el peldaño de antes y cuánto va de uno a otro, de 0 a 1), o null si no sube.
function subidaDe(s, i, now = relojSubida) {
  const u = subidas.get(i);
  if (!u || u.s !== s || s.height[i] !== u.de + 1) return null;
  const t = now - u.t0;
  if (t >= ASIENTO_MS) return null;
  const h = t <= 0 ? u.de
          : t < SUBIDA_MS ? u.de + 1.25 * subir(t / SUBIDA_MS)
          : u.de + 1.25 - 0.25 * asentar((t - SUBIDA_MS) / (ASIENTO_MS - SUBIDA_MS));
  return { h, de: u.de, f: Math.min(1, Math.max(0, h - u.de)) };
}

// Altura en píxeles a la que se dibuja la cara de arriba de una celda.
function topY(s, i) {
  const sub = subidaDe(s, i), h = sub ? sub.h : s.height[i];
  return layout.cy[i] - Math.max(0, h - 1) * LIFT;
}

// Mezcla de dos colores #rrggbb, en #rrggbb (shade los sigue entendiendo).
function mezclar(a, b, f) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = k => Math.round(((x >> k) & 255) + (((y >> k) & 255) - ((x >> k) & 255)) * f);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}

// El reborde de cera (v11.22, T-13): luz en el canto izquierdo y los dos de arriba,
// sombra en el derecho y los dos de abajo, y un aro interior color cera. La luz y
// la sombra se compensan, así que el brillo medio de la cara (el nivel) no cambia.
// En las apagadas del fallo explicado va a la opacidad de lo apagado.
const REBORDE_APAGADO = 0.42;
function reborde(ctx, x, y, R, h) {
  const r = R * 0.95, w = Math.sqrt(3) * r / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  ctx.moveTo(x - w, y + r / 2); ctx.lineTo(x - w, y - r / 2); ctx.lineTo(x, y - r); ctx.lineTo(x + w, y - r / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w, y - r / 2); ctx.lineTo(x + w, y + r / 2); ctx.lineTo(x, y + r); ctx.lineTo(x - w, y + r / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.stroke();
  hexPath(ctx, x, y, R * 0.9);
  ctx.lineWidth = R * 0.03;
  ctx.strokeStyle = h === OPERCULADA ? 'rgba(110,76,20,0.20)' : h === MAX_LEVEL ? 'rgba(255,236,190,0.22)' : 'rgba(255,236,190,0.14)';
  ctx.stroke();
  ctx.restore();
}

function hexPath(ctx, x, y, R) {
  const w = Math.sqrt(3) * R;
  ctx.beginPath();
  ctx.moveTo(x, y - R);
  ctx.lineTo(x + w / 2, y - R / 2);
  ctx.lineTo(x + w / 2, y + R / 2);
  ctx.lineTo(x, y + R);
  ctx.lineTo(x - w / 2, y + R / 2);
  ctx.lineTo(x - w / 2, y - R / 2);
  ctx.closePath();
}

// El lateral del prisma: el contorno inferior del hexágono, extruido D px.
function sidePath(ctx, x, y, R, D) {
  const w = Math.sqrt(3) * R;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + R / 2);
  ctx.lineTo(x, y + R);
  ctx.lineTo(x + w / 2, y + R / 2);
  ctx.lineTo(x + w / 2, y + R / 2 + D);
  ctx.lineTo(x, y + R + D);
  ctx.lineTo(x - w / 2, y + R / 2 + D);
  ctx.closePath();
}

// ui = { cells, ready, fuera, abejas, destellos, sinNumeros, sinItem, guia, explica }
//   ready   la cadena ya es una jugada válida
//   fuera   el dedo está fuera del panal: soltar cancela
//   abejas  partículas de la cosecha: { x, y, t0 } — las lleva app.js
//   sinNumeros, sinItem   para el panal vivo del inicio (v9): es un decorado, así
//           que ni el nivel escrito en las celdas ni la gota. Por defecto, no.
//   guia    el tutorial (v11.2): { celdas, recorrido, salida } — la jugada buena con
//           un velo claro, el camino del dedo de puntos y un punto rosa que lo
//           recorre; con `salida`, el camino acaba fuera del panal (cancelar)
//   explica el fallo explicado en el panal (v11.2): { grupo, etiqueta } — el resto
//           apagado, el grupo de máx con borde rojo y la etiqueta encima
function draw(ctx, s, ui, now) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const R = layout.R;
  if (now !== undefined) relojSubida = now;
  for (const [i, u] of subidas) if (relojSubida - u.t0 > SUBIDA_MS + ARO_MS) subidas.delete(i);
  const inChain = new Set(ui.cells);
  const capullos = new Set(s.desastres.filter(d => d.tipo === 'capullo').map(d => d.tile));
  // Celdas con el reloj del contagio debajo del nivel (v11.19): las de varroa y velutina.
  const relojes = new Set(s.huellas ? s.huellas.flatMap(g => g.tiles) : []);
  // El fallo explicado (v11.2): las celdas fuera del grupo de máx se pintan apagadas
  // en su turno del bucle (un velo encima, después, pisaría a las vecinas en el 2.5D).
  const grupoMax = ui.explica ? new Set(ui.explica.grupo) : null;

  // Orden por índice = de arriba abajo, que es el que hace solapar bien el 2.5D.
  for (let i = 0; i < s.height.length; i++) {
    // Celda rota: no existe. Ni hexágono ni borde. El panal encoge de verdad y se
    // ve que encoge.
    if (s.roto[i]) continue;
    // Celda cerrada (Expansión, v10): el hueco donde crecerá el panal, con un
    // contorno discontinuo. Sin número y sin relleno: no es un nivel, es sitio.
    // Desde la v11.8 (T-51) más marcado, porque con mucha luz se perdía: blanco al
    // 50 % (era 16 %) y R·0,08, unos 2 px en pantalla (era 1,2 en unidades del
    // lienzo, que dibuja al doble: 0,6 px). Proporcional a R, igual en cualquier
    // móvil. La selección sigue siendo continua y gruesa, con halo: no se confunden.
    if (s.cerrada[i]) {
      if (ui.abriria && ui.abriria.includes(i)) {
        // La cosecha que estás arrastrando la abriría (leído del motor).
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin((now || 0) / 140);
        hexPath(ctx, layout.cx[i], layout.cy[i], R * 0.94);
        ctx.fillStyle = 'rgba(46,71,86,0.55)';
        ctx.fill();
        ctx.strokeStyle = '#E6B872';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else {
        hexPath(ctx, layout.cx[i], layout.cy[i], R * 0.94);
        ctx.strokeStyle = 'rgba(237,228,211,0.5)';
        ctx.lineWidth = R * 0.08;
        ctx.setLineDash([R * 0.18, R * 0.14]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      continue;
    }

    const x = layout.cx[i];
    const h = s.height[i];
    // Subiendo (v11.22): la altura, el color y el número van del peldaño de antes al nuevo.
    const sub = subidaDe(s, i);
    const D = Math.max(0, (sub ? sub.h : h) - 1) * LIFT;   // el agua se dibuja a ras, sin prisma
    const y = layout.cy[i] - D;
    const apagada = grupoMax && !grupoMax.has(i);
    const base = sub ? mezclar(LEVEL_COLORS[sub.de], LEVEL_COLORS[h], sub.f) : LEVEL_COLORS[h];
    const color = apagada ? shade(base, 0.42) : base;

    if (D > 0) {
      ctx.fillStyle = apagada ? shade(base, 0.42 * 0.55) : shade(color, 0.55);
      sidePath(ctx, x, y, R, D);
      ctx.fill();
    }

    ctx.fillStyle = color;
    hexPath(ctx, x, y, R);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Las apagadas del fallo explicado, con el reborde también apagado.
    ctx.globalAlpha = apagada ? REBORDE_APAGADO : 1;
    reborde(ctx, x, y, R, h);
    ctx.globalAlpha = 1;

    if (!ui.sinNumeros) {
      // Con reloj de contagio debajo (v11.19, T-57), el nivel sube y encoge para
      // dejarle sitio dentro del anillo (opción B: 0,44·R, unos 13 px a 360).
      const conReloj = relojes.has(i);
      ctx.font = `600 ${Math.round(R * (conReloj ? 0.44 : 0.55))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Subiendo, el número cambia seco a mitad de camino: con fundido cruzado, el
      // 2 claro y el 3 oscuro (el texto cambia de tono en la larva) se veían a la vez.
      const n = sub && sub.f < 0.5 ? sub.de : h;
      ctx.fillStyle = apagada ? 'rgba(255,245,225,0.3)' : n >= LARVA ? 'rgba(30,20,5,0.7)' : 'rgba(255,245,225,0.8)';
      ctx.fillText(String(n), x, conReloj ? y - R * 0.17 : y);
    }

    // Seda: la celda está bloqueada unos turnos.
    if (s.sedaHasta[i] > s.turn) {
      ctx.save();
      hexPath(ctx, x, y, R);
      ctx.clip();
      ctx.strokeStyle = 'rgba(245,245,245,0.75)';
      ctx.lineWidth = 1.5;
      for (let k = -2 * R; k < 2 * R; k += R / 3) {
        ctx.beginPath();
        ctx.moveTo(x + k, y - R); ctx.lineTo(x + k + R, y + R);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Capullo de polilla: aviso, eclosiona en el siguiente fallo.
    if (capullos.has(i)) {
      ctx.beginPath();
      ctx.ellipse(x + R * 0.42, y - R * 0.38, R * 0.17, R * 0.26, 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#d8d2c4';
      ctx.fill();
      ctx.strokeStyle = '#6b6254';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Huellas (Contagio, v10): un anillo rojizo por dentro de la celda. No toca el
  // relleno, porque el brillo es el nivel (Tema y estética §3), y va más hacia
  // el centro que la cadena, que es blanca y pega al borde: se ven las dos a la
  // vez. El grupo que crece al pasar el turno parpadea (avisa, nunca por sorpresa).
  // Desde la v11.19 (T-57), bajo el nivel, los turnos que le faltan a su grupo
  // (turnosParaContagio, del motor): todo el grupo dice lo mismo, así se ve qué
  // celdas van juntas, y el número parpadea con el anillo. Rojo claro con halo
  // oscuro, 0,40·R, dentro del anillo sin tocarlo.
  if (s.huellas && s.huellas.length) {
    const inminentes = new Set(contagioInminente(s));
    ctx.save();
    ctx.lineJoin = 'round';
    for (const g of s.huellas) {
      ctx.globalAlpha = inminentes.has(g) ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((now || 0) / 160)) : 0.9;
      for (const i of g.tiles) {
        if (!existe(s, i)) continue;
        hexPath(ctx, layout.cx[i], topY(s, i), R * 0.62);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = R * 0.17;
        ctx.stroke();
        ctx.strokeStyle = '#e5484d';
        ctx.lineWidth = R * 0.1;
        ctx.stroke();
      }
      const faltan = String(turnosParaContagio(s, g));
      ctx.font = `800 ${Math.round(R * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = R * 0.1;
      ctx.strokeStyle = '#1c1710';
      ctx.fillStyle = '#ff8a8d';
      for (const i of g.tiles) {
        if (!existe(s, i)) continue;
        const ty = topY(s, i) + R * 0.25;
        ctx.strokeText(faltan, layout.cx[i], ty);
        ctx.fillText(faltan, layout.cx[i], ty);
      }
    }
    ctx.restore();
  }

  // Puzzle (v11): las marcas del objetivo, leídas del motor (objetivoPuzle). La
  // roja, un borde rojo pegado al canto; la marcada, un anillo amarillo
  // discontinuo más adentro (así se ven las dos, y la cadena blanca, a la vez);
  // la A y la B, una letra pequeña arriba a la derecha. Ninguna toca el relleno:
  // el brillo es el nivel (Tema y estética §3). Con halo oscuro, como la cadena,
  // para que se vean también sobre la abeja y la operculada.
  if (s.puzle) {
    const o = objetivoPuzle(s);
    ctx.save();
    ctx.lineJoin = 'round';
    for (const i of o.rojas) {
      if (!existe(s, i)) continue;
      hexPath(ctx, layout.cx[i], topY(s, i), R * 0.86);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = R * 0.18; ctx.stroke();
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = R * 0.11; ctx.stroke();
    }
    for (const i of o.marcadas) {
      if (!existe(s, i)) continue;
      hexPath(ctx, layout.cx[i], topY(s, i), R * 0.62);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = R * 0.15; ctx.stroke();
      ctx.setLineDash([R * 0.2, R * 0.13]);
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = R * 0.09; ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = `800 ${Math.round(R * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [i, letra] of Object.entries(o.letras)) {
      const x = layout.cx[i] + R * 0.5, y = topY(s, Number(i)) - R * 0.48;
      ctx.lineWidth = R * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(letra, x, y);
      ctx.fillStyle = '#ffd23f'; ctx.fillText(letra, x, y);
    }
    ctx.restore();
  }

  // El fallo explicado en el panal (v11.2, T-49): cuando el nivel ya ha acabado, el
  // grupo más grande (grupoMeseta, del motor) con borde rojo, todo lo demás apagado
  // y encima «máx 3 · paso 4». Sólo al terminar: mientras se juega sería una pista.
  // (Las apagadas ya se han pintado así en el bucle de arriba.)
  if (ui.explica) {
    const grupo = grupoMax;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const i of grupo) {
      hexPath(ctx, layout.cx[i], topY(s, i), R * 0.86);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = R * 0.17; ctx.stroke();
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = R * 0.1; ctx.stroke();
    }
    if (ui.explica.etiqueta && grupo.size) {
      const xs = [...grupo].map(i => layout.cx[i]);
      const arriba = Math.min(...[...grupo].map(i => topY(s, i))) - R * 1.15;
      pildora(ctx, ui.explica.etiqueta, (Math.min(...xs) + Math.max(...xs)) / 2, arriba, R, width);
    }
    ctx.restore();
  }

  // La cadena: un contorno grueso, «la negrita del borde» (v7). No se oscurece
  // la celda porque en este juego el brillo ES el nivel: una larva oscurecida
  // se leería como un huevo justo cuando el jugador decide qué está a la misma
  // altura. Blanco a medio grosor mientras está incompleta, grueso cuando está
  // lista, con un halo oscuro debajo para que se vea también sobre la
  // operculada, que es crema. Hacia dentro del hexágono, para no pisar a las
  // vecinas, y en una pasada aparte para que ninguna celda lo tape.
  // Con el dedo fuera del panal se apaga: soltar ahí cancela.
  if (inChain.size) {
    const blanco = ui.ready ? R * 0.16 : R * 0.09;
    const halo = blanco + R * 0.08;
    ctx.save();
    ctx.globalAlpha = ui.fuera ? 0.3 : 1;
    ctx.lineJoin = 'round';
    for (const i of inChain) {
      if (s.roto[i]) continue;
      const x = layout.cx[i], y = topY(s, i);
      hexPath(ctx, x, y, R - halo / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = halo;
      ctx.stroke();
      hexPath(ctx, x, y, R - halo / 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = blanco;
      ctx.stroke();
    }
    ctx.restore();
  }

  // El aro de la subida (v11.22, T-14): al llegar arriba, un hexágono blanco que
  // crece de 0,9·R a 1,3·R y se apaga. Sólo contorno, encima de todas las celdas
  // (si no, las de la fila de abajo lo taparían).
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = R * 0.04;
  for (const [i, u] of subidas) {
    const k = (relojSubida - u.t0 - SUBIDA_MS) / ARO_MS;
    if (u.s !== s || k < 0 || k >= 1 || !existe(s, i)) continue;
    ctx.globalAlpha = 0.45 * (1 - k);
    hexPath(ctx, layout.cx[i], topY(s, i), R * (0.9 + 0.4 * k));
    ctx.stroke();
  }
  ctx.restore();

  // Destellos: lo que acaba de pasar, marcado sobre las celdas afectadas durante
  // un segundo. Hasta la v4 la varroa, la velutina y la helada sólo existían en
  // una línea de texto del HUD, así que un cambio en el tablero no tenía causa
  // visible (T-16).
  for (const d of (ui.destellos || [])) {
    const k = Math.min(1, ((now || 0) - d.t0) / 900);
    if (k < 0 || k >= 1) continue;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3 * (1 - k) + 1;
    for (const i of d.tiles) {
      if (layout.cx[i] === undefined) continue;
      hexPath(ctx, layout.cx[i], topY(s, i), R * (1 + 0.25 * k));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ítem: gota de néctar sobre su celda. Parpadea en su último turno: si no lo
  // coges ahora, se evapora (v5).
  if (s.item && !ui.sinItem) {
    const x = layout.cx[s.item.tile];
    const y = topY(s, s.item.tile) - R * 0.1;
    const ultimo = (s.item.caduca - s.turn) <= 1;
    const pulso = 1 + (ultimo ? 0.20 : 0.08) * Math.sin((now || 0) / (ultimo ? 90 : 180));
    ctx.beginPath();
    ctx.arc(x, y, R * 0.36 * pulso, 0, Math.PI * 2);
    ctx.fillStyle = s.item.tipo === ITEMS.REINA ? '#b04ad8' : (ultimo ? '#ff9f45' : '#ffd23f');
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = s.item.tipo === ITEMS.REINA ? '#fff' : '#3a2a00';
    ctx.font = `700 ${Math.round(R * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((ITEM_INFO[s.item.tipo] || {}).simbolo || '?', x, y + 1);
  }

  // El recorrido del dedo ya no se dibuja (v7): el contorno dice qué está
  // elegido, y la línea tapaba los números. drag.trail se sigue usando en
  // input.js para saber dónde está el dedo y para deshacer.

  // La guía del tutorial (v11.2, T-49). El camino lo calcula app.js (geometría: un
  // recorrido por las celdas de la jugada de la solución guardada, que vuelve por
  // las ya elegidas cuando hace falta); aquí sólo se pinta.
  if (ui.guia && ui.guia.recorrido.length) {
    const g = ui.guia;
    const pts = g.recorrido.map(i => [layout.cx[i], topY(s, i)]);
    if (g.salida) {
      const [ux] = pts[pts.length - 1];
      pts.push([Math.min(width - R * 0.4, ux + R * 1.4), height - R * 0.2]);
    }
    ctx.save();
    for (const i of g.celdas) {
      hexPath(ctx, layout.cx[i], topY(s, i), R);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (pts.length > 1) {
      ctx.beginPath();
      pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.setLineDash([2, R * 0.2]);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(3, R * 0.08); ctx.stroke();
      ctx.setLineDash([]);
    }
    // El punto rosa recorre el camino en bucle: 450 ms por tramo y una pausa al final.
    const tramos = Math.max(1, pts.length - 1), ciclo = tramos * 450 + 700;
    const t = Math.min(1, ((now || 0) % ciclo) / (tramos * 450)) * tramos;
    const k = Math.min(tramos - 1, Math.floor(t)), f = pts.length > 1 ? t - k : 0;
    const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
    const px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f;
    ctx.fillStyle = 'rgba(242,143,177,0.35)';
    ctx.beginPath(); ctx.arc(px, py, R * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F28FB1';
    ctx.beginPath(); ctx.arc(px, py, R * 0.19, 0, Math.PI * 2); ctx.fill();
    if (g.salida) {
      const [ex, ey] = pts[pts.length - 1];
      pildora(ctx, 'Fuera: no cuenta', ex - R * 1.6, ey - R * 0.7, R, width);
    }
    ctx.restore();
  }

  // Cosecha: la abeja sale volando.
  for (const a of (ui.abejas || [])) {
    const t = ((now || 0) - a.t0) / 900;
    if (t < 0 || t > 1) continue;
    const x = a.x + Math.sin(t * 9 + a.x) * R * 0.25;
    const y = a.y - t * R * 3.5;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#F79A1F';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(x - R * 0.12, y - R * 0.12, R * 0.12, R * 0.07, -0.6, 0, Math.PI * 2);
    ctx.ellipse(x + R * 0.12, y - R * 0.12, R * 0.12, R * 0.07, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Qué celda hay bajo un punto. Por distancia al centro, no por polígono exacto:
// en un móvil los hexágonos son pequeños y el dedo es gordo. Las celdas rotas no
// cuentan (no existen), ni las cerradas (v10); el agua sí, es jugable.
function tileAt(s, px, py) {
  let best = -1, bestD = layout.R * 0.95;
  for (let i = 0; i < s.height.length; i++) {
    if (!existe(s, i)) continue;
    const d = Math.hypot(px - layout.cx[i], py - topY(s, i));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Una etiqueta roja redonda con texto blanco, centrada en (x, y) y sin salirse del
// canvas: «máx 3 · paso 4», «Fuera: no cuenta» (v11.2).
function pildora(ctx, txt, x, y, R, width) {
  // El canvas va en píxeles del dispositivo (hasta ×2, como en resize): 13 px de letra como poco.
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const fs = Math.round(Math.max(13 * dpr, R * 0.34));
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  const tw = ctx.measureText(txt).width, ph = fs * 1.8, pw = tw + fs * 1.4;
  const cx = Math.max(pw / 2 + 4, Math.min(width - pw / 2 - 4, x)), cy = Math.max(ph / 2 + 2, y);
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2); else ctx.rect(cx - pw / 2, cy - ph / 2, pw, ph);
  ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, cx, cy + 1);
}
