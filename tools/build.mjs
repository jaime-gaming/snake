// empaqueta js/*.js en un solo snake.js sin módulos, para que la página
// funcione también abriendo index.html a doble clic (file://) y en cualquier
// hosting estático sin configurar nada. sin dependencias.
//
//   node tools/build.mjs          escribe snake.js
//   node tools/build.mjs --check  falla si snake.js no coincide con js/*.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'snake.js');

// orden de dependencias: cada módulo sólo usa los anteriores
const ORDEN = ['grid', 'levels', 'audio', 'input', 'engine', 'main'];

const RE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'\.\/([a-z]+)\.js[^']*';?$/gm;
const RE_EXPORT = /^export\s+(const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/gm;

function transformar(id, fuente) {
  const exportados = [];

  let codigo = fuente.replace(RE_IMPORT, (linea, nombres, origen) => {
    if (!ORDEN.includes(origen)) throw new Error(`${id}: importa de un módulo desconocido (${origen})`);
    const lista = nombres.split(',').map((n) => n.trim()).filter(Boolean).join(', ');
    return `const { ${lista} } = modulos['${origen}'];`;
  });

  codigo = codigo.replace(RE_EXPORT, (linea, tipo, nombre) => {
    exportados.push(nombre);
    return `${tipo} ${nombre}`;
  });

  if (/^\s*(export|import)\s/m.test(codigo)) {
    throw new Error(`${id}: queda un import/export sin transformar`);
  }

  const entrega = exportados.length
    ? `\n  Object.assign(modulo, { ${exportados.join(', ')} });\n`
    : '';

  return `\n// ---- ${id} ----\n(function (modulo) {\n'use strict';\n${codigo}${entrega}})(modulos['${id}']);\n`;
}

function generar() {
  const partes = ORDEN.map((id) => {
    const ruta = path.join(RAIZ, 'js', `${id}.js`);
    if (!fs.existsSync(ruta)) throw new Error(`falta js/${id}.js`);
    return transformar(id, fs.readFileSync(ruta, 'utf8'));
  });

  const modulos = ORDEN.map((id) => `${id}: {}`).join(', ');
  const version = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').match(/snake\.js\?v=(\d+)/);
  const sello = `${new Date().toISOString().slice(0, 10)} · v${version ? version[1] : '?'}`;

  return `/* snake — un solo fichero, sin módulos. generado por tools/build.mjs (${sello}).
   no lo edites a mano: cambia js/*.js y vuelve a ejecutar node tools/build.mjs */
(function () {
'use strict';
const modulos = { ${modulos} };
${partes.join('')}})();
`;
}

const contenido = generar();
const modoCheck = process.argv.includes('--check');

if (modoCheck) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : '';
  const limpio = (t) => t.replace(/generado por tools\/build\.mjs \([^)]*\)/, '');
  if (limpio(actual) !== limpio(contenido)) {
    process.stderr.write('snake.js está desfasado: ejecuta node tools/build.mjs\n');
    process.exit(1);
  }
  process.stdout.write('snake.js al día\n');
} else {
  fs.writeFileSync(SALIDA, contenido);
  const kb = (Buffer.byteLength(contenido) / 1024).toFixed(1);
  process.stdout.write(`snake.js escrito · ${kb} kB\n`);
}
