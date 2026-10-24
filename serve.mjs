// servidor estático de desarrollo: sin caché, para que cada recarga traiga
// lo que hay ahora mismo en disco. sin dependencias.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();
const PUERTO = Number(process.argv[2] || 8123);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const servidor = http.createServer((peticion, respuesta) => {
  const url = new URL(peticion.url, 'http://local');
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';

  const destino = path.join(RAIZ, path.normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!destino.startsWith(RAIZ)) {
    respuesta.writeHead(403).end('fuera de sitio');
    return;
  }

  fs.readFile(destino, (err, datos) => {
    const marca = new Date().toISOString().slice(11, 19);
    process.stdout.write(`${marca} ${err ? 404 : 200} ${ruta}${url.search}\n`);
    if (err) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('no está');
      return;
    }
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Access-Control-Allow-Origin': '*',
    });
    respuesta.end(datos);
  });
});

servidor.listen(PUERTO, '0.0.0.0', () => {
  process.stdout.write(`sirviendo ${RAIZ} en http://0.0.0.0:${PUERTO} (sin caché)\n`);
});
