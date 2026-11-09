// Copia el juego (la web de la carpeta de arriba) a www/, que es lo que Capacitor mete en la app.
// La web es el original: aquí no se edita nada, sólo se copia lo que el juego carga.
import { cpSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const web = join(aqui, '..');
const destino = join(aqui, 'www');

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino);

cpSync(join(web, 'index.html'), join(destino, 'index.html'));
cpSync(join(web, 'js'), join(destino, 'js'), { recursive: true });
// De puzles/ sólo los scripts que carga index.html (el resto es la máquina de generar niveles).
for (const f of ['objetivos.js', 'buscador.js', 'juego.js']) {
  cpSync(join(web, 'puzles', f), join(destino, 'puzles', f));
}
// De img/ sólo lo que se ve; img/fuente/ son los originales de los dibujos.
cpSync(join(web, 'img'), join(destino, 'img'), {
  recursive: true,
  filter: s => !s.includes(join('img', 'fuente')),
});

const html = readFileSync(join(destino, 'index.html'), 'utf8');
const version = (html.match(/\?v=([\d.]+)/) || [])[1] || '?';
console.log(`Copiada la web v${version} a www/`);
