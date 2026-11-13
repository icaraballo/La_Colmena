// Fabrica la app: `node construir.mjs apk` (para instalar en el móvil) o `node construir.mjs aab` (para Play).
// Antes copia la web y la pasa al proyecto Android, así que siempre sale con el juego tal como está.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const que = process.argv[2];
// Pruebas que hay que pasar antes de fabricar (se ejecutan en la carpeta de la web, la de arriba).
// Si alguna falla no sale ni APK ni AAB. Para saltarlas en un caso urgente: `npm run apk -- --sin-tests`.
const PRUEBAS = ['npm test', 'npm run test:puzles'];
const tareas = { apk: 'assembleRelease', aab: 'bundleRelease' };
if (!tareas[que]) { console.error('Uso: node construir.mjs apk|aab'); process.exit(1); }
if (!existsSync(join(homedir(), 'Claves_Android', 'la_colmena.properties'))) {
  console.error('No está la clave de firma en ~/Claves_Android: la app saldría sin firmar.');
  process.exit(1);
}

const correr = (cmd, cwd = aqui) => execSync(cmd, { cwd, stdio: 'inherit' });
if (process.argv.includes('--sin-tests')) {
  console.warn('\n⚠ SIN PRUEBAS: esta app se fabrica sin pasar los tests.\n');
} else {
  for (const cmd of PRUEBAS) {
    console.log(`\n> ${cmd}`);
    try { correr(cmd, join(aqui, '..')); }
    catch { console.error(`\nFalla «${cmd}»: no se fabrica la app. Arregla el fallo (o usa --sin-tests si es urgente).`); process.exit(1); }
  }
}
correr('node copiar-web.mjs');
correr('npx cap sync android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
correr(`${process.platform === 'win32' ? '.\\' : ''}${gradlew} ${tareas[que]}`, join(aqui, 'android'));

const salida = que === 'apk'
  ? join(aqui, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  : join(aqui, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
console.log(`\nHecho: ${salida}`);
