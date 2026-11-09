// Dibuja los originales del icono y la pantalla de arranque (el hexágono de img/favicon.svg)
// y los guarda en ../assets/, de donde `npx @capacitor/assets generate --android` saca todos los tamaños.
// Uso: node iconos/dibujar.mjs  (necesita Chrome; ruta en CHROME o la de Windows por defecto)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(aqui, '..', 'assets');
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONDO = '#12100C';
mkdirSync(salida, { recursive: true });

// El hexágono en una caja de 46×46, como favicon.svg: canto oscuro debajo y cara naranja encima.
const hex = `<polygon points="23,3 43,14.5 43,34 23,45 3,34 3,14.5" fill="#8a560f"/>
<polygon points="23,1 43,12.5 43,31.5 23,43 3,31.5 3,12.5" fill="#F79A1F"/>`;

// lado: tamaño de la imagen; escala: qué parte ocupa el hexágono; fondo: color o null (transparente).
function dibujar(nombre, lado, escala, fondo) {
  const h = lado * escala, x = (lado - h) / 2;
  const html = `<!doctype html><style>html,body{margin:0;background:${fondo || 'transparent'};overflow:hidden}</style>
<svg width="${lado}" height="${lado}"><svg x="${x}" y="${x}" width="${h}" height="${h}" viewBox="0 0 46 46">${hex}</svg></svg>`;
  const f = join(tmpdir(), `lc-${nombre}.html`);
  writeFileSync(f, html);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${lado},${lado}`, `--screenshot=${join(salida, nombre)}`, `file:///${f.replace(/\\/g, '/')}`], { stdio: 'ignore' });
  rmSync(f);
  console.log(`assets/${nombre}`);
}

dibujar('icon-only.png', 1024, 0.66, FONDO);         // icono clásico (móviles antiguos) y el de Play
dibujar('icon-foreground.png', 1024, 0.56, null);    // capa delantera del icono adaptable: cabe en la zona segura
dibujar('icon-background.png', 1024, 0, FONDO);      // capa trasera: sólo el fondo
dibujar('splash.png', 2732, 0.12, FONDO);            // pantalla de arranque
dibujar('splash-dark.png', 2732, 0.12, FONDO);
